require('dotenv').config({silent: true, path: '.env'});

exports.myHandler = function myHandler( event, context ) {
  context.succeed({status: 'ok myHandler'});
}

exports.otherHandler = function otherHandler( event, context ) {
  context.succeed({status: 'ok otherHandler'});
}

exports['my-another-handler'] = function myAnotherHandler( event, context ) {
  context.succeed({status: 'ok from my-another-handler'});
}