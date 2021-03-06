module.exports = function (entryPoint, serverPort, ALLOW_CORS) {
  var fs = require('fs')
    , http = require('http')
    , path = require('path')
    , colors = require('colors')
    , url = require('url')
    , _ = require('lodash')
    , functions = require('./functions')
    ;

  var serverDomain = '127.0.0.1'
    , serverUrl = 'http://' + serverDomain + ':' + serverPort
    , fileExtension = '.json'
    , server
    ;

  var reply = function (request, response, status, headers, content, filePath) {
    if (!response.finished) {
      if(ALLOW_CORS) {
        headers["Access-Control-Allow-Origin"] = "*";
        headers["Access-Control-Allow-Headers"] = "Origin, X-Requested-With, Content-Type, Accept";
        headers['Access-Control-Request-Method'] = '*';
        headers['Access-Control-Allow-Methods'] = '*';
        headers['Access-Control-Allow-Headers'] = '*';
      }
      response.writeHead(status, headers);
      if (content) {
        response.write(content.toString());
      }
      response.end();
      console.log(" -> " + request.method + " " + serverUrl + request.url + ' ' + (status > 299 ? status.toString().red : status.toString().green) + (filePath ? ' -> ' + filePath.cyan : ''));
    }
  };

  server = http.createServer(function (request, response) {
    var parsedUrl = url.parse(request.url, true)
      , dirPath = entryPoint + parsedUrl.pathname
      , filePath = dirPath + fileExtension
      ;

    /*
     Redirects all GET requests with the url that ends with / to the same url without /
     e.g. http://127.0.0.1:1337/posts/ -> http://127.0.0.1:1337/posts
     */
    if (request.method == 'GET' && parsedUrl.pathname.match(/.+\/$/)) {
      reply(request, response, 302, {'Location': serverUrl + parsedUrl.pathname.replace(/\/$/, '')});
    }



    /*
     On GET method, checks if file exists
     e.g. http://127.0.0.1:1337/posts -> ~/posts.json
     */
    else if (request.method == 'GET' && fs.existsSync(filePath)) {

      functions.readJSONFile(filePath)
        .then(function (content) {
          content = JSON.stringify(content);
          reply(request, response, 200, {'Content-Type': 'application/json'}, content, filePath);
        })
        .catch(function (err) {
          reply(request, response, 500, {'Content-Type': 'text/plain'}, err + "\n", filePath);
        })
    }

    /*
     On GET method, checks if directory exists
     e.g. http://127.0.0.1:1337/posts -> ~/posts/
     */
    else if (request.method == 'GET' && fs.existsSync(dirPath)) {
      functions.readDir(dirPath, fileExtension)
        .then(functions.pushContentFiles)
        .then(function (content) {
          content = JSON.stringify(content);
          reply(request, response, 200, {'Content-Type': 'application/json'}, content, dirPath);
        })
        .catch(function (err) {
          reply(request, response, 500, {'Content-Type': 'text/plain'}, err, dirPath);
        })
    }

    /*
     On POST method checks if directory exists
     */
    else if (request.method == 'POST') {
      if (!fs.existsSync(dirPath)) {
        var mkdirpSync = function (dirPath) {
          var parts = dirPath.split(path.sep);

          for( var i = 1; i <= parts.length; i++ ) {
            var newPath = path.join.apply(null, parts.slice(0, i));

            if (!fs.existsSync(newPath)) {
              fs.mkdirSync(newPath);
            }
          }
        }

        mkdirpSync(dirPath);
      }

      // Retrieve request content
      request.on('data', function (chunk) {
        var jsonContent;

        // Validate request content as JSON
        try {
          jsonContent = JSON.parse(chunk.toString());
        }
          // If not a valid JSON, returns an error 400
        catch (e) {
          reply(request, response, 400, {'Content-Type': 'text/plain'}, "400 Bad request\n");
        }

        // Read inside directory
        fs.readdir(dirPath, function (err, files) {

          // To create a new file, it searches for a new id and a new name
          var id = files.length;
          do {
            jsonContent.id = id;
            filePath = dirPath + '/' + id++ + fileExtension
          } while (fs.existsSync(filePath));

          // Prepare the JSON to be written in the file
          var content = JSON.stringify(jsonContent);

          // Write or overwrite the content
          fs.writeFile(filePath, content, function (err) {

            // If something goes wrong, it returns a 500 status error
            if (err) {
              reply(request, response, 500, {'Content-Type': 'text/plain'}, filePath + ': ' + err + "\n", filePath);
            }

            // If it is all done, it returns the updated content with a 200 http status
            reply(request, response, 200, {'Content-Type': 'application/json'}, content, filePath);
          });
        })
      });
    }

    /*
     On PATCH  or PUT method checks if file exists
     */
    else if ((request.method == 'PATCH' || request.method == 'PUT') && fs.existsSync(filePath)) {
      // Retrieve request content
      request.on('data', function (chunk) {
        var jsonContent;

        // Validate request content as JSON
        try {
          jsonContent = JSON.parse(chunk.toString());
        }
          // If not a valid JSON, return an error 400
        catch (e) {
          reply(request, response, 400, {'Content-Type': 'text/plain'}, "400 Bad request\n");
        }

        if (request.method == 'PATCH') {
          // Validate request content as JSON
          functions.readJSONFile(file)
            .then(function (content) {
              jsonContent = _.extend(content, jsonContent);
            })
            .catch(function () {
              reply(request, response, 500, {'Content-Type': 'text/plain'}, new Error(file + ': invalid JSON'), filePath);
            });
        }

        // Prepare the JSON to be written in the file
        var content = JSON.stringify(jsonContent);

        // Write or overwrite the content
        fs.writeFile(filePath, content, function (err) {

          // If something goes wrong, it returns a 500 status error
          if (err) {
            reply(request, response, 500, {'Content-Type': 'text/plain'}, filePath + ': ' + err + "\n", filePath);
          }

          // If it is all done, it returns the updated content with a 200 http status
          reply(request, response, 200, {'Content-Type': 'application/json'}, content, filePath);
        });

      });
    }

    /*
     On DELETE method checks if directory exists
     e.g. http://127.0.0.1:1337/posts -> ~/posts/
     */
    else if (request.method == 'DELETE' && fs.existsSync(filePath)) {

      // Delete file
      fs.unlink(filePath, function (err) {

        // If something goes wrong, it returns a 500 status error
        if (err) {
          reply(request, response, 500, {'Content-Type': 'text/plain'}, filePath + ': ' + err + "\n", filePath);
        }

        // If it is all done, it returns an empty content with a 200 http status
        reply(request, response, 200, {'Content-Type': 'text/plain'}, null, filePath);
      });
    }

    /*
     No directory or file found
     */
    else {
      reply(request, response, 404, {'Content-Type': 'text/plain'}, "404 Not Found\n");
    }

  });

  function jrsStartServer() {
    try {
      server.listen(serverPort, serverDomain);
      console.log('\nServer running at '.grey + serverUrl.cyan);
      console.log('\nServing directory '.grey + path.resolve(entryPoint).toString().cyan);
      console.log('\nCORS enabled: '.grey + ALLOW_CORS.toString().cyan);
    } catch (err) {
    }

    server.on('error', function (error) {
      console.error('\nServer closed on error.'.red, error);
    });
  }
  return jrsStartServer;
};
