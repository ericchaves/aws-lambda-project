var lambda = require(path.join(__base, 'index'));

/*
    You should export multiple handler functions.
    All function exported in index.js will be deployed as a lambda function
*/
describe('index', function(){
  it('should export a handler named myHandler', function(){
    expect(lambda).to.have.a.property('myHandler');
  });

  it('should export a handler named otherHandler', function(){
    expect(lambda).to.have.a.property('otherHandler');
  });

  /*
    To test a handler function just create a new Context passing 
    a callback function and assert its results.
  */
  describe('myHandler', function(){
    it('should pass when called with any events', function(done){
      var evt = { key1: 'a value' };
      lambda.myHandler(evt, new Context(function(error, item){
        expect(error).not.to.exist;
        done();
      }));
    });
  });
});