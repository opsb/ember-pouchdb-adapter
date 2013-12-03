// global variables
var list, lists,
    item, items,
    store, adapter;

module('DS.PouchDBAdapter', {

  setup: function() {
    stop();

    PouchDB.destroy('ember-pouchdb-test', function() {
      start();
    });


    App.List = DS.Model.extend({
      name: DS.attr('string'),
      b: DS.attr('boolean'),
      tags: DS.attr(),
      items: DS.hasMany('item')
    });

    // App.List.toString = function() {
    //   return 'App.List';
    // };

    App.Item = DS.Model.extend({
      name: DS.attr('string'),
      list: DS.belongsTo('list')
    });

    // App.Item.toString = function() {
    //   return 'App.Item';
    // };

    App.ApplicationAdapter = DS.PouchDBAdapter.extend({
      databaseName: 'ember-pouchdb-test'
    });

    store = App.__container__.lookup("store:main");

  },

  teardown: function() {
    App.reset();

    list = null;
    lists = null;
  }

});

test('existence', function() {
  ok(DS.PouchDBAdapter, 'PouchDBAdapter added to DS namespace');
});

asyncTest('create and find', function() {

  Ember.run(function(){
    var record = store.createRecord('list', { id: 'l2', name: 'two', b: true});
    record.save();

    record = store.createRecord('list', { id: 'l1', name: 'one', b: true });

    record.save().then(function() {
      App.reset();

      store.find('list', 'l1').then(function(list) {
        equal(list.get('name'), 'one', 'Record loaded');
        start();
      }, function(err){
        ok(false, err);
        start();
      });
    }, function(err){
      ok(false, err);
      start();
    });
  });
});

asyncTest('create with generated id', function() {
  Ember.run(function(){
    var record = store.createRecord('list', { name: 'one' });

    record.save().then(function(response) {
      ok(response.get('id').length === 36, 'UUID assigned');
      start();
    }, function(err){
      ok(false, err);
      start();
    });
  });

});

asyncTest('create and find with hasMany', function() {
  Ember.run(function(){
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var item = store.createRecord('item', { id: 'i1', name: 'one', list: list });

    Ember.RSVP.all([item.save(), list.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.find('list', 'l1').then(function(list) {
        var items = list.get('items');
        equal(items.get('length'), 1, 'hasMany items should be loaded');
        start();
      }, function(err){
        ok(false, err);
        start();
      });
    }, function(err){
      ok(false, err);
      start();
    });
  });
});

asyncTest('create and findMany', function() {
  Ember.run(function(){
    var list1 = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var list2 = store.createRecord('list', { id: 'l2', name: 'two', b: true });
    var list3 = store.createRecord('list', { id: 'l3', name: 'three', b: true });

    Ember.RSVP.all([list1.save(), list2.save(), list3.save()]).then(function() {
      App.reset();
      store.unloadAll('list');

      store.findByIds('list', ['l1', 'l3']).then(function(lists){
        deepEqual(lists.mapBy('id'), ['l1', 'l3'], 'records with ids should be loaded');
        start();
      }, function(err){
        ok(false, err);
        start();
      });

    }, function(err){
      ok(false, err);
      start();
    });

  });
});

asyncTest('create and update', function() {
  Ember.run(function(){
    var record = store.createRecord('list', { id: 'l1', name: 'one', b: true });

    record.save().then(function(record2) {
      record2.set('name', 'one and a half');

      record2.save().then(function(record3) {
        ok(true, 'Record was updated');
        start();
      });
    });
  });

});

asyncTest('create find and update', function() {
  Ember.run(function(){
    var record = store.createRecord('list', { id: 'l1', name: 'one', b: true });

    record.save().then(function() {
      App.reset();
      store.unloadAll('item');

      store.find('list', 'l1').then(function(list){
        list.set('name', 'one and a half');

        list.save().then(function() {
          ok(true, 'Record was updated');
          start();
        });
      });
    });

  });
});

asyncTest('create and multiple update', function() {
  Ember.run(function(){
    var record = store.createRecord('list', { id: 'l1', name: 'one', b: true });

    record.save().then(function(record2) {
      record2.set('name', 'one and a half');

      record2.save().then(function(record3) {
        record3.set('name', 'two');

        record3.save().then(function(record4) {
          ok(true, 'Record was updated');
          start();
        });
      });
    });
  });
});

asyncTest('create and findAll', function() {
  Ember.run(function(){
    item = store.createRecord('item', { id: 'i1', name: 'one' });
    list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var record = store.createRecord('list', { id: 'l2', name: 'two', b: false });

    Ember.RSVP.all([item.save(), list.save(), record.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.find("list").then(function(lists) {
        deepEqual(lists.mapBy('id'), ['l1', 'l2'], 'Records were loaded');
        start();
      });
    });
  });
});

asyncTest('create and delete', function() {
  Ember.run(function(){
    var record = store.createRecord('list', { id: 'l1', name: 'one', b: true });

    record.save().then(function() {
      record.deleteRecord();
      record.save().then(function(record2) {
        ok(record2.get('isDeleted'), 'Record was updated');
        start();
      });
    });
  });
});

asyncTest('create and findQuery', function() {
  Ember.run(function(){
    var list1 = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var list2 = store.createRecord('list', { id: 'l2', name: 'two', b: false });

    Ember.RSVP.all([list1.save(), list2.save()]).then(function() {
      App.reset();
      store.unloadAll('list');

      store.find('list', {name: 'two'}).then(function(result) {
        equal(result.get('length'), 1, 'Record loaded');
        var content = result.get('content');
        equal(content[0].get('name'), 'two', 'Wrong record loaded');
        start();
      });
    });
  });
});

/*

test('findQuery', function() {
  lists = store.findQuery(App.List, {name: /one|two/});
  assertQuery(2);

  lists = store.findQuery(App.List, {name: /.+/, id: /l1/});
  assertQuery();

  lists = store.findQuery(App.List, {name: 'one'});
  assertQuery();

  lists = store.findQuery(App.List, {b: true});
  assertQuery();
});

test('findAll', function() {
  lists = store.findAll(App.List);
  clock.tick(1);
  assertListsLength(3);
  assertStoredLists();
});

test('createRecords', function() {
  createAndSaveNewList();
});

test('updateRecords', function() {
  createAndSaveNewList();
  list.set('name', 'updated');
  commit();
  assertStoredList();
});

test('deleteRecords', function() {
  createAndSaveNewList();

  list.deleteRecord();
  assertState('deleted');

  commit();

  assertState('deleted');
  assertListNotFoundInStorage();

  lists = store.findAll(App.List);
  clock.tick(1);

  assertListsLength(3);
});

test('bulkCommits changes', function() {
  var listToUpdate = App.List.find('l1');
  var listToDelete = App.List.find('l2');
  App.List.createRecord({name: 'bulk new'}); // will find later

  clock.tick(1);

  listToUpdate.set('name', 'updated');
  listToDelete.deleteRecord();

  commit();

  var updatedList = App.List.find('l1');
  var newListQuery = store.findQuery(App.List, {name: 'bulk new'});
  clock.tick(1);
  var newList = newListQuery.objectAt(0);

  assertState('deleted', true, listToDelete);
  assertListNotFoundInStorage(listToDelete);
  assertStoredList(updatedList);
  assertStoredList(newList);
});

test('load hasMany association', function() {
  list = App.List.find('l1');
  clock.tick(1);

  assertStoredList();

  items = list.get('items');
  clock.tick(1);

  assertStoredItems();
});

test('load belongsTo association', function() {
  item = Item.find('i1');
  clock.tick(1);
  list = item.get('list');
  clock.tick(1);

  assertStoredList();
});

test('saves belongsTo and hasMany associations', function() {
  list = App.List.find('l1');
  clock.tick(1);
  item = Item.createRecord({name: '3', list: list});
  commit();

  assertItemBelongsToList(item, list);
  assertListHasItem(list, item);
});

test('QUOTA_EXCEEDED_ERR when storage is full', function() {
  occupyLocalStorage();
  var handler = sinon.spy();
  adapter.on('QUOTA_EXCEEDED_ERR', handler);

  list = App.List.createRecord({name: n100k});

  assertState('new');
  store.commit();
  assertState('saving');

  clock.tick(1);

  assertState('saving', false);
  assertState('error');
  equal(handler.getCall(0).args[0].list[0], list,
      'error handler called with record not saved');

  // clean up
  localStorage.removeItem('junk');
});

*/
