# Router
# =======
#
# **Router** uses the [Express > Router](http://expressjs.com/api.html#router) middleware
# for handling all routing from DIVAServices.
#
# Copyright &copy; Marcel Würsch, GPL v3.0 licensed.

# Require Express Router
nconf = require 'nconf'
router = require('express').Router()
GetHandler = require './getHandler'
PostHandler = require './postHandler'
logger = require '../logging/logger'
Upload = require '../upload/upload'
ImageHelper = require '../helper/imageHelper'
IoHelper = require '../helper/ioHelper'
ResultHelper = require '../helper/resultHelper'
schemaValidator = require '../validator/schemaValidator'
Statistics = require '../statistics/statistics'
AlgorithmManagement = require '../management/algorithmManagement'


async = require 'async'


getHandler = new GetHandler()
postHandler = new PostHandler()

# Set up special route for image uploading
router.post '/upload', (req, res) ->
  if(req.body.image?)
    Upload.uploadBase64 req.body.image, (err, result) ->
      res.json {md5: result.md5}
  else if(req.body.url?)
    Upload.uploadUrl req.body.url, (err, result) ->
      res.json {md5: result.md5}

router.post '/jobs/:jobId', (req, res, next) ->
  process = Statistics.getProcess(req.params.jobId)
  Statistics.endRecording(req.params.jobId, process.req.originalUrl)
  #remoteExecution = new RemoteExecution(nconf.get('remoteServer:ip'),nconf.get('remoteServer:user'))
  #remoteExecution.cleanUp(process)
  async.waterfall [
    (callback) ->
      process.result = req.body
      ResultHelper.saveResult(process, callback)
    (callback) ->
      process.resultHandler.handleResult(null, null, null, process, (error, data, processId) ->
        callback null
      )
  ], (err) ->
    res.status '200'
    res.send()

router.post '/validate/:schema', (req, res, next) ->
  switch req.params.schema
    when 'host'
      validate(req, res, 'hostSchema')
    when 'hostAlgorithm'
      validate(req, res, 'algorithmSchema')
    when 'response'
      validate(req, res, 'responseSchema')
    when 'detailsAlgorithm'
      validate(req, res, 'algorithmSchema')

router.post '/management/algorithms', (req, res, next) ->
  #add a new algorithm
  #get route address
  route = AlgorithmManagement.generateUrl(req.body)
  AlgorithmManagement.generateFolders(route)
  logger.log 'info', route
  res.status '200'
  res.send()

# Set up the routing for POST requests
router.post '*', (req, res, next) ->
  postHandler.handleRequest req, (err, response) ->
    response['statusCode'] = 202
    sendResponse res, err, response

router.get '/image/check/:md5', (req, res) ->
  ImageHelper.imageExists req.params.md5, (err, response) ->
    sendResponse res, err, response

router.get '/collections/:collection/:execution', (req, res) ->
#zip folder
  ioHelper = new IoHelper()
  filename = ioHelper.zipFolder(nconf.get('paths:imageRootPath') + '/' + req.params.collection + '/' + req.params.execution)
  res.status '200'
  res.json ({zipLink: 'http://' + nconf.get('server:rootUrl') + '/static/' + filename})
  res.send()

router.get '/image/results/:md5', (req, res)->
  ImageHelper.imageExists req.params.md5, (err, response) ->
    if(response.imageAvailable)
      response = ResultHelper.loadResultsForMd5(req.params.md5)
    else
      err =
        statusCode: 404
        statusText: 'This result is not available'

    sendResponse res, err, response

#Info routes
router.get '/info/inputs', (req, res) ->
  ioHelper = new IoHelper()
  inputs = ioHelper.loadFile('conf/algorithmInputs.json')

  sendResponse res, null, inputs

router.get '/info/outputs', (req, res) ->
  ioHelper = new IoHelper()
  outputs = ioHelper.loadFile('conf/algorithmOutputs.json')
  sendResponse res, null, outputs,

    router.get '/info/general', (req, res) ->
      ioHelper = new IoHelper()
      general = ioHelper.loadFile('conf/generalAlgorithmInfos.json')

      sendResponse res, null, general

router.get '/info/additional', (req, res) ->
  ioHelper = new IoHelper()
  additional = ioHelper.loadFile('conf/additionalAlgorithmInfos.json')
  sendResponse res, null, additional

router.get '/info/languages', (req, res) ->
  ioHelper = new IoHelper()
  languages = ioHelper.loadFile('conf/algorithmProgrammingLanguages.json')
  sendResponse res, null, languages

# Set up the routing for GET requests
router.get '*', (req, res, next) ->
  getHandler.handleRequest req, (err, response) ->
    sendResponse res, err, response


# ---
# **sendResponse**</br>
# Send response back to the caller </br>
# `params`
#   *res* response object from the express framework
#   *err* possible error message. If set a HTTP 500 will be returned
#   *response* the JSON response. If set a HTTP 200 will be returned
sendResponse = (res, err, response) ->
  if(err?)
    sendError(res, err)
  else
    send200(res, response)


send200 = (res, response) ->
  res.status response.statusCode or 200
  #parse an unparsed json string to get a correct response
  try
    res.json JSON.parse(response)
  catch error
    res.json response

sendError = (res, err) ->
  res.status err.statusCode or 500
  error =
    status: err.statusCode
    message: err.statusText
  res.json error

validate = (req, res, schema) ->
  schemaValidator.validate(req.body, schema, (error) ->
    if error
      sendError(res, error)
    else
      send200(res, {status: 'valid'})
  )

# Expose router
module.exports = router
