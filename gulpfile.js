var gulp = require('gulp');

gulp.task('default', function() {
  // place code for your default task here
});

gulp.task('publish-prahlad', function() {
  var s3 = require("gulp-s3");
  var fs = require('fs');
  var awsCredentials = JSON.parse(fs.readFileSync('./aws.json'));
  return gulp.src('src/*.*')
       .pipe(s3(awsCredentials, {
         uploadPath: awsCredentials.prahladPath,
         headers: {
           'x-amz-acl': 'public-read'
         }
       }));
});

gulp.task('publish-prahlad-css', function() {
  var s3 = require("gulp-s3");
  var fs = require('fs');
  var awsCredentials = JSON.parse(fs.readFileSync('./aws.json'));
  return gulp.src('src/css/*.*')
       .pipe(s3(awsCredentials, {
         uploadPath: awsCredentials.prahladPath,
         headers: {
           'x-amz-acl': 'public-read'
         }
       }));
});

gulp.task('publish-prahlad-js', function() {
  var s3 = require("gulp-s3");
  var fs = require('fs');
  var awsCredentials = JSON.parse(fs.readFileSync('./aws.json'));
  return gulp.src('src/js/**.*')
       .pipe(s3(awsCredentials, {
         uploadPath: awsCredentials.prahladPath + 'js/',
         headers: {
           'x-amz-acl': 'public-read'
         }
       }));
});

gulp.task('publish-prahlad-secrets', function() {
  var s3 = require("gulp-s3");
  var fs = require('fs');
  var rename = require('gulp-rename');
  var awsCredentials = JSON.parse(fs.readFileSync('./aws.json'));
  return gulp.src('src/js/prahlad-secrets.js')
       .pipe(rename(function (path) {
          path.basename = 'secrets';
        }))
       .pipe(s3(awsCredentials, {
         uploadPath: awsCredentials.prahladPath +'js/',
         headers: {
           'x-amz-acl': 'public-read'
         }
       }));
});

