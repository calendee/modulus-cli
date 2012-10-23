var modulus = require('../modulus'),
    librarian = require('../common/api').librarian,
    userConfig = require('../common/api').userConfig,
    fs = require('fs'),
    ProgressBar = require('progress'),
    Progress = require('../util/progress'),
    request = require('request');

var Project = function() {

};

Project.prototype.create = function(name, creatorId, callback) {
  librarian.project.create({
    name: name,
    creator: creatorId
  }, userConfig.data.apiKey, callback);
};

Project.prototype.find = function(opts, callback) {
  librarian.project.find(opts, userConfig.data.apiKey, callback);
};

Project.prototype.saveVars = function(projectId, vars, callback) {
  librarian.project.saveVars(projectId, vars, userConfig.data.apiKey, callback);
};

Project.prototype.deploy = function(projectId, file, callback) {
  var host = librarian._http._host;
  var port = librarian._http._port;

  var url = host + ':' + port;
  var endpoint = 'http://' + url + '/project/deploy/' + projectId + '?authToken=' + userConfig.data.apiKey;

  modulus.io.print('Uploading project...');
  var status = Project.status.uploading;

  fs.stat(file, function(err, stat) {
    fs.createReadStream(file).pipe(
      request.put(
        {
          method: 'PUT',
          uri : endpoint,
          headers : {
            'content-length' : stat.size
          }
        },
        function(err, res, b) {
          if(err) {
            callback(err);
          }
        }
      )
    );

    // start checking for status changes
    // show progress for upload and inderminate progress for deploying
    var ubar = new ProgressBar('Upload progress [:bar] :percent', {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: stat.size
    });
    ubar.tick();
    var uploadTimeout = null;
    var uploadProgress = function() {
      librarian.project.uploadProgress(projectId, userConfig.data.apiKey, function(err, p) {
        if(err) {
          setTimeout(uploadProgress, 100);
          return;
        }
        ubar.tick(p.bytesReceived - ubar.curr);
        if(p.bytesReceived < stat.size && status === Project.status.uploading) {
          uploadTimeout = setTimeout(uploadProgress, 200);
        }
      });
    };
    uploadTimeout = setTimeout(uploadProgress, 500);

    var dbar = new Progress.indeterminate('Deploying [:bar]');

    // check every second for project status change
    var projectStatus = function () {
      librarian.project.find({projectId : projectId}, userConfig.data.apiKey, function(err, proj) {
        if(proj.status.toLowerCase() !== status) {
          var newStatus = proj.status.toLowerCase();
          if(newStatus === Project.status.deploying) {
            status = newStatus;
            clearTimeout(uploadTimeout);
            ubar.tick(stat.size);
            modulus.io.print('\nDeploying Project...');
            dbar.start();
          } else if(newStatus === Project.status.running && status !== Project.status.uploading) {
            dbar.stop();
            modulus.io.print(' ');
            return callback(null);
          }
        }
        if(status !== Project.status.running) {
          setTimeout(projectStatus, 1000);
        }
      });
    };
    projectStatus();
  });
};

Project.status = {
  uploading : 'uploading',
  deploying : 'deploying',
  running : 'running'
};

module.exports = new Project();