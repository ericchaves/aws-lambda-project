var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var minimist = require('minimist');
var path = require('path');
var del = require('del');
var AWS = require('aws-sdk');
var fs = require('fs')
var runSequence = require('run-sequence');
var git = require('git-rev-sync');
var each = require('each-async');

var options = minimist(process.argv.slice(2), {});
var    dist = '.dist';
var    zip  = 'dist.zip';
gulp.task('specs', function(){
  var report = options.report || 'dot';
  if (options.spec){ report = 'spec'; }

  function Context(callback){
    var callback = callback || console.log;
    return {
      done: function(error, item){ callback.call(this, error, item) }.bind(this),
      fail: function(error){ callback.call(this, error ) }.bind(this),
      succeed: function(item){ callback.call(this, null, item )}.bind(this)
    }
  };
  
  /* injecting common assertion styles and libs. */
  /* eg.: we add a global __base variable pointing to project root to aid in test's require */
  GLOBAL.Context = Context;
  GLOBAL.__base  = __dirname + '/'; // __base points to the project root
  GLOBAL.chai    = require('chai'),
  GLOBAL.assert  = require('chai').assert;
  GLOBAL.expect  = require('chai').expect;
  GLOBAL.should  = require('chai').should();
  GLOBAL.path    = path;
/*
  GLOBAL.sinon   = require('sinon');
  GLOBAL.chai.use(require('sinon-chai'));
  GLOBAL.chai.use(require('chai-datetime'));
*/
  require('dotenv').config({silent: false, path: path.join(__dirname, 'config.env.tests')});

  return gulp.src(path.join(__dirname , 'tests/**/*.spec.js'), {read: false})
    .pipe($.plumber())
    .pipe($.mocha({ui: 'bdd', reporter: report, timeout: 10 * 1000 }));
});

gulp.task('serve', function() {
    options.report = options.report || 'dot';
    function print(file){ $.util.log($.util.colors.blue(file.path + ' changed.')) };

    // watch for specs or code changes
    $.watch([
      '**/*.{js,spec.js,json}',
      '!node_modules/**/*'
      ],
      {read: false}, 
      function(file){ print(file); gulp.start('specs'); }
    );
});

gulp.task('clean', function() {
  return del([dist, zip]);
});

gulp.task('zip', function() {
  return gulp.src([
      '!' + path.join(dist, 'package.json'),
      path.join(dist, '**/*'), 
      path.join(dist, '/.*')
    ])
    .pipe($.zip(path.basename(zip)))
    .pipe(gulp.dest(__dirname));
});

gulp.task('deploy', function(callback) {
  runSequence(
    ['clean'],
    ['sources'],
    ['zip'],
    ['upload'],
    ['clean'],
    callback
  );
});


gulp.task('sources', function() {
  var env = null;
  if (options.production)
    env = path.join(__dirname, 'config.env.production')
  else if (options.stage)
    env = path.join(__dirname, 'config.env.stage')
  else if (options.tests)
    env = path.join(__dirname, 'config.env.tests')
  else if (options.env)
    env = path.join(__dirname, 'config.env.' + options.env)
  
  if (env){
    gulp.src(env)
      .pipe($.rename('.env'))
      .pipe(gulp.dest(dist));
  };

  return gulp.src([
      path.join(__dirname, 'package.json'),
      path.join(__dirname, 'index.js'),
      path.join(__dirname, '**/*.{js,json}'),
      '!' + path.join(__dirname, 'gulpfile.js'),
      '!' + path.join(__dirname, 'tests/**/*'),
      '!' + path.join(__dirname, 'node_modules/**/*')
    ]).on('error', $.util.log)
    .pipe(gulp.dest(dist))
    .pipe($.install({production: true}));
});

gulp.task('upload', function(callback) {

  var pkg = require(path.join(__dirname, dist,'/package.json'));
  var main = require(path.join(__dirname, dist, pkg.main));
  var profile = pkg.lambda;
  var version = [git.short(), '@', git.branch()].join('');
  var handlers = [];

  var list = options.handlers ? options.handlers.split(',') : Object.keys(main);
  list.forEach(function(h){
    if (profile.handlers[h])
      handlers.push(h);
  });

  if (handlers.length == 0){
    $.util.log($.util.colors.yellow('No handler found. Check your lambda section on package.json.'));
    return callback();
  }

  var content = fs.readFileSync(zip);

  /* we should lock on lambda 2014 version since uploadFunction was removed from new versions */
  var lambda = new AWS.Lambda({apiVersion: '2014-11-11', region: options.region || profile.region});

  var deploy = function deploy(handler, index, done){
    var desc = profile.handlers[handler] ? ':' + profile.handlers[handler] : '';
    var params = {
      FunctionName: handler,
      Handler: [path.basename(pkg.main, '.js'), handler].join('.'),
      Mode: options.mode || profile.mode,
      Role: options.role || profile.role,
      Description: [version, profile.handlers[handler]].join(': '),
      MemorySize: options.memory || profile.memory,
      Timeout: options.timeout || profile.timeout,
      Runtime: 'nodejs'
    };

    lambda.getFunctionConfiguration({FunctionName: handler}, function(err, data){
      if (err && (err.statusCode != 404)) {
        $.util.log($.util.colors.red('AWS API request failed. Check your AWS credentials and permissions.'));
        $.util.log($.util.colors.red(err.message));
        return done(err);
      }else{
        $.util.log($.util.colors.green('deploying ' + handler + '....'));
        params.FunctionZip = content;
        lambda.uploadFunction(params, function(err, data) {
          if (err) {
            $.util.log($.util.colors.red('Package upload failed. Check your iam:PassRole permissions.'));
            $.util.log($.util.colors.red(err.message));
            return done(err);
          }else{
            $.util.log($.util.colors.blue(handler + ' deployed.'));
            return done();
          }
        });
      }
    });
  };

  each(handlers, deploy, callback);
});

gulp.task('default', function(){
  $.util.log('usage: gulp [serve | deploy]');
  $.util.log('  serve --report [dot | specs]');
  $.util.log('  deploy [--handlers=<handlers list>] [--env=<target> | --production | --stage]');
})