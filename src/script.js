/* global BGLApp */
/* global $ */
/* global Parse */

window.BGLApp = {};
BGLApp.appVersion = '1.41';

/* Controls whether Google Sheets posting is done from the client */
BGLApp.clientSideGooglePost = false; //  [it's done in the Parse.com cloud code]

/* API secrets are in the secrets.js file */
BGLApp.secrets = window.BGLAppSecrets;

/* The following switches for debugging work anywhere in the notes field:

testNoParse : Do not push to Parse.com backend
testNoParseAnalytics: Do not include in Parse.com analytics
testNoPushover: Do not send a Pushover notification
testNoGoogle: Do not push to Google Sheet backend
testUser: change the logged user to "Test"

*/

/*

Version 1.2: Changed REST endpoint to a Google Apps script.
"Tools > Script Editor" in the spreadsheet to access.

Version 1.22: Added additional Parse backend.

Version 1.23: Added localStorage accessor to avoid namespace collision with
Parse in the localStorage.

Version 1.24: Added Parse Analytics.

Version 1.25: Added Pushover notifications to the backend, and also changed the
HTTP status 0 from Google Sheets to an error.

Version 1.26: Added URL parameters to auto-fill the sheet.

Version 1.27 Fixed bug with testNoParse - the switch was the wrong way around.

Version 1.28: Fixed markCleaninParse - was not setting object properties correctly.

Version 1.29: HTTP status 0 error 405 comes back from Google Sheets REST endpoint in Safari - handle it!
https://bugs.webkit.org/show_bug.cgi?id=136081
https://code.google.com/p/google-apps-script-issues/issues/detail?id=3226
https://code.google.com/p/google-apps-script-issues/issues/detail?id=4582
https://code.google.com/p/google-apps-script-issues/issues/detail?id=2707

Version 1.32: Moved secrets into js/secrets.js

Version 1.33: Disable button on take

Version 1.35: Structured routing to allow the sheets post to be done in Parse. Cloud code still
gets a 405 atm. :(

Version 1.36: Added switch for client-side Google Sheets posting, and server-side beforeSave 
function in Parse. Parse cloud code still not reliable for Google Sheets posting, so keeping it
client-side.
https://code.google.com/p/google-apps-script-issues/issues/detail?id=3226
https://code.google.com/p/google-apps-script-issues/issues/detail?id=4582
https://code.google.com/p/google-apps-script-issues/issues/detail?id=2707

Version 1.39: Sync added to postToParse to have alert appear before form is cleaned.

Version 1.40: Changed the Google Sheets interface from POST to GET - solving the 405 issue.
Added users and user preferences on the Parse.com backend. Abstracted the Google Sheets
interface and pushover on a per-user basis. Moved pushover notification to Parse.com

Version 1.41: Added testUser for notes.

*/

function calculateDose (bgl, carbs) {
  // Need to get these from the UserPrefs on the server
  var correctionFactor = 2; // 1U lowers BGL by 2mmol/l
  var insulinRatio = 2; // 2U per carb portion
  var carbsPerServe = 15; // 15g per serve

  var bglToCorrect = bgl - 7;
  var correction = 0;
  var dose = 0;
  // If last rapid was less than 3 hours ago, no correction

  if (bgl < 4 ) {
    correction = 0 - Math.round((5 - bgl) / 2);
  }

  if (bgl >= 8) { // Apply correction dose for anything over 8
    if (bgl >= 20) { // Correction tops out at 20 mmol/l
      bglToCorrect = 13;
    }
    correction = Math.round(bglToCorrect / correctionFactor);
  }
  dose = Math.round((carbs / carbsPerServe) * insulinRatio + correction);
  dose = (dose < 0) ? 0 : dose;
  return dose;
}

function doCalculation(){
  var bgl = document.getElementById('BGL').value;
  var carbs = document.getElementById('Carbs').value;

  document.getElementById('Rapid').value = calculateDose(bgl,carbs);

}

function convertTimeTo24Hr(inputval)
{

  var tokens = /([10]?\d):([0-5]\d) ([ap]m)/i.exec(inputval);
  if (tokens == null) { return null; }
  if (tokens[3].toLowerCase() === 'pm' && tokens[1] !== '12') {
    tokens[1] = '' + (12 + (+tokens[1]));
  } else if (tokens[3].toLowerCase() === 'am' && tokens[1] === '12') {
    tokens[1] = '00';
  }
  var convertedval = tokens[1] + ':' + tokens[2];

  return convertedval;

}


function formSubmit() {
  constructEntry(true);
}

function cleanForm() {
  $('#BGL').val('');
  $('#Carbs').val('');
  $('#Rapid').val('');
  $('#Basal').val('');
  $('#Notes').val('');

  $("input[name='date']").val('');
  $('#Time').val('');

  // enable the button
  $('#Take').attr('disabled', false);
  $('#Take').val('Take');
  $('#Take').removeClass('sending');
  
}

function constructEntry(sync) {
  sync = sync || false;
  var bgl = $('#BGL').val();
  var carbs = $('#Carbs').val();
  var rapid = $('#Rapid').val();
  var basal = $('#Basal').val();
  var notes = $('#Notes').val();

  var date = $("input[name='date']").val() || new Date().toJSON().slice(0,10);
  var d = new Date();
  var localeTime = d.toLocaleTimeString().toLocaleUpperCase();
  var timeSeparator = (localeTime.indexOf('AM') > 0) ? 'AM' : 'PM';
  var newLocaleTime = localeTime.substr(0, localeTime.indexOf(timeSeparator) + 2);

  var localeTimeSansSeconds = newLocaleTime.replace(/:(\d{2}) (?=[AP]M)/, " ");
  var time = $('#Time').val() ||
  convertTimeTo24Hr(localeTimeSansSeconds);

  var timestamp = date + ' ' + time;
  var guid = JSON.stringify(new Date());

  if ( bgl === "" &&
  carbs === "" &&
  rapid ==="" &&
  basal ==="" &&
  notes === "" )
  { return false; } // nothing to do
  else {

    // disable the button
    $('#Take').attr('disabled', true);
    $('#Take').val('Sending...');
    $('#Take').addClass('sending');

    var entry = {
      bgl: bgl,
      carbs: carbs,
      rapid: rapid,
      basal: basal,
      notes: notes,
      timestamp: timestamp,
      guid: guid
    };
    postEntry(entry, sync)
  }

}

function postEntry(entry, sync) {
  postDirtyToLocalDB(entry);
  if(BGLApp.onLine) {
    postEntryOnline(entry, sync);
  } else {
    console.log('Operating offline.');
    cleanForm();
  }
}

function postEntryOnline(entry, sync) {
  postToParse(entry, sync);
  if (BGLApp.clientSideGooglePost) {
    postToGoogle(entry, sync);
  }
}

function postToParse(entry, sync){
    // Post with note 'testNoParse' (without quotes) to avoid pushing to Parse
    if (entry.notes.indexOf('testNoParse ') == -1) {
      entry.priority = 0;
      if (entry.bgl > 12 || entry.bgl < 4) entry.priority = 1;
      console.log('Posting to Parse');
      var bglEntryObject = Parse.Object.extend("bglEntry");
      var bglEntry = new bglEntryObject();
      // Multi-user support
      entry.appUser = BGLApp.secrets.appUser;
      entry.userGuid = BGLApp.secrets.userGuid;

      if (entry.notes.indexOf('testUser') !== -1) {
        entry.appUser = 'Test';
      }

      bglEntry.save(entry).then(function(object) {
        console.log('Entry saved to Parse');
        markCleanInLocalDB(entry.guid);
        if (!BGLApp.clientSideGooglePost) {
          sync && alert('Posted');
          cleanForm();
        } 
      });

      var dimensions = {category: 'BGL range'};

      var range = 'normal';
      var bgl = entry.bgl;
      if (bgl < 4) { range = 'low'; };
      if (bgl > 8) { range = 'high';};
      if (bgl > 12) { range = 'very high';};
      if (bgl > 16) { range = 'dangerous';};
      dimensions.range = range;

      // Send the dimensions to Parse along with the 'search' event
      if (entry.notes.indexOf('testNoParseAnalytics') !== -1) {
        Parse.Analytics.track('BGL Levels', dimensions);
      }
    } else {
      sync && alert('Posted locally - entry will never go to Parse');
      cleanForm();
    }
}

function postDirtyToLocalDB (entry) {
  console.log('Posting Dirty Entry to Local DB');

  entry.dirty = true;

  if (BGLApp.ForerunnerDBSupport) { // Posts Entry to Local IndexedDB via Forerunner
    BGLApp.bglEntries.insert(entry);
    dbPersist('dirty');
  } else {
    localStorageWrite(entry);
  }
}

function dbPersist(operation){
  BGLApp.bglEntries.save(function (err) {
    console.log('Persisted BGL Entry as ' + operation);
    if (!err) {
      // Save was successful
    }
  });
}

// localStorage accessors. These exist to namespace entries.

function localStorageWrite(entry){
  var guid = 'bglentry-' + entry.guid;
  localStorage.setItem(guid, JSON.stringify(entry));
}

function localStorageRead(guid){
  return JSON.parse(localStorage.getItem('bglentry-' + guid))
}

function retrieveLocalStorageEntries() {
  var entries = [];
  for (var i = 0; i < localStorage.length; i++) {
    var guid = localStorage.key( i );
    if (guid.indexOf('bglentry-') === 0) {
      entries.push(JSON.parse( localStorage.getItem(guid)));
    }
  }
  return entries;
}

function markEntryClean(guid) {
  markCleanInLocalDB(guid);
  if (BGLApp.clientSideGooglePost) markCleaninParse(guid);
}

function markCleanInLocalDB (guid) {
  console.log('Marking clean in Local DB');
  if (BGLApp.ForerunnerDBSupport) {
    // Entry has been pushed to Google
    BGLApp.bglEntries.updateById(guid, {dirty: false});
    dbPersist('clean');
  } else { // using localStorage
    var entry = localStorageRead(guid);
    entry.dirty = false;
    entry.writing = false;
    localStorageWrite(entry);
  }
}

function markCleaninParse (guid) {
  console.log('Marking entry clean in Parse');
  var bglEntryObject = Parse.Object.extend("bglEntry");
  //var bglEntry = new bglEntryObject();
  var query = new Parse.Query(bglEntryObject);
  query.equalTo("guid", guid);
  query.find({
    success: function(results) {
      console.log("Successfully retrieved " + results.length + " entries.");
      for (var i = 0; i < results.length; i++) {
        var object = results[i];
        object.set('dirty', false);
        object.save(null, {
          success: function(bglEntry) {
            // Execute any logic that should take place after the object is saved.
            console.log('Parse entry marked clean');
          },
          error: function(gameScore, error) {
            // Execute any logic that should take place if the save fails.
            // error is a Parse.Error with an error code and message.
            console.log('Failed to mark Parse entry clean, with error code: ' + error.message);
          }
        });
      }
    },
    error: function(error) {
      console.log("Parse entry query: Error: " + error.code + " " + error.message);
    }
  });

}

  function postToGoogle (entry, sync) {

    // https://code.google.com/p/google-apps-script-issues/issues/detail?id=3226
    // "405 Method not allowed errors in Safari" bug
    // Move the Google Sheets post into a Parse.com cloud trigger
    // Which means setting the Google Sheets

    console.log('Posting entry to Google Sheets');
    entry = localStorageRead(entry.guid);
    entry.writing = true;
    localStorageWrite(entry);

    // set entry.priority=-1 for a quiet notification via Pushover
    // otherwise it defaults on the service-side to priority = 1 - alert
    // https://pushover.net/api#priority

    entry.priority = 0;
    if (entry.bgl > 12 || entry.bgl < 4) entry.priority = 1;
    $.ajax({
      url: BGLApp.secrets.bglEndpointURL,
      data: entry,
    type: "POST",
    dataType: "xml",
    statusCode: {
      0: function () {
        console.log('Entry posted to Google Sheets');
        markEntryClean(entry.guid);
        sync && alert("Posted");    
        //alert("Error posting to Google Sheets. Entry stored locally. Reload page to resend.");
        cleanForm();
      },
      200: function () {
        console.log('Entry posted to Google Sheets');
        markEntryClean(entry.guid);
        sync && alert("Posted");
        cleanForm();
      }
    }
  });
}

function urlParam(name){
    var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (results==null){
       return null;
    }
    else{
       return results[1] || 0;
    }
}

function setValuesFromURL(){
  $('#BGL').val(urlParam('bgl'));
  $('#Carbs').val(urlParam('carbs'));
  $('#Rapid').val(urlParam('rapid'));
  $('#Basal').val(urlParam('basal'));
  $('#Notes').val(urlParam('notes'));
}

function initializeParse() {
  if (!BGLApp.parseInitialized) {
    Parse.initialize(BGLApp.secrets.parseAPIKey, BGLApp.secrets.parseAPIKey2);
    window.parseInitialized = true;
  }
}

function pageSetup(){
  console.log('Setting up App');
  setValuesFromURL();
  BGLApp.ForerunnerDBSupport = false;
  BGLApp.onLine = navigator.onLine;
  BGLApp.parseInitialized = false;
  if (BGLApp.onLine) {
      initializeParse();
  }
  
  // Set the edit link from the secrets file
  $('#viewResults').attr('href', BGLApp.secrets.viewResultsLink);
  
  if (BGLApp.secrets.developer) {
    
  }

  BGLApp.writingDirtyStore = false;
  var status = BGLApp.onLine ? 'Online' : 'Offline';
  $('#online-status').text('[ v' + BGLApp.appVersion + ' Working ' + status + ' ]');

  window.addEventListener('online',  function goOnline(){
    BGLApp.onLine = true;
    console.log('Going Online...');
    $('#online-status').text('[ v' + BGLApp.appVersion + ' Working Online ]');
    initializeParse();
    writeDirtyStore();
  });
  window.addEventListener('offline', function goOffline(){
    BGLApp.onLine = false;
    console.log('Going Offline...')
    $('#online-status').text('[ v' + BGLApp.appVersion + ' Working Offline ]');
  });

  if (BGLApp.ForerunnerDBSupport) {
    // Persistent Local DB via ForerunnerDB (IndexedDB)
    var db = new ForerunnerDB();
    BGLApp.bglEntries = db.collection('bglEntries', {primaryKey: 'timestamp'});
    BGLApp.bglEntries.load(function (err) {
      console.log('Loaded bglEntries DB');
      if (!err) {
        // Load was successful
        if (BGLApp.onLine) {
          writeDirtyStore();
        }
      }
    });
  } else {
    // Using localStorage only
    if (BGLApp.onLine) {writeDirtyStore();}
  }
}

function writeDirtyStore() {
  console.log('Checking Dirty Store');
  if (!BGLApp.writingDirtyStore) {
    BGLApp.writingDirtyStore = true;
    if (BGLApp.ForerunnerDBSupport) {
      // Write dirty local entries to Google
      var dirtyEntries = BGLApp.bglEntries.find({dirty: true});
      dirtyEntries.forEach( function (entry){
        postEntryOnline(entry,false);
      });
    } else {
      var localStorageEntries = retrieveLocalStorageEntries();
      var dirtyEntryCount = 0;
      console.log(localStorageEntries.length + ' entries found in Local Store');
      for (var i = 0; i < localStorageEntries.length; i++) {
        var entry = localStorageEntries[i];
        if (entry.dirty && !entry.writing) {
          dirtyEntryCount ++;
          postEntryOnline(entry, false);
        }
      }
      console.log(dirtyEntryCount + ' dirty entries');
    }
    BGLApp.writingDirtyStore = false;
  }
}
