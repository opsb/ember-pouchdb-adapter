App = Ember.Application.create();

// App.rootElement = "#ember-testing";

App.setupForTesting();

App.injectTestHelpers();

Ember.onerror = function(error){
  console.log(error.stack);
  start();
}
Ember.RSVP.configure('onerror', function(error) {
  console.log(error.stack);
  ok(false, error);
  start();
});

