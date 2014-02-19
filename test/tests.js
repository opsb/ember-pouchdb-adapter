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
      items: DS.hasMany('item', {inverse: 'list'}),
      asyncItems: DS.hasMany('item', {async: true, inverse: 'asyncList'})
    });

    App.Item = DS.Model.extend({
      name: DS.attr('string'),
      list: DS.belongsTo('list', {inverse: 'items'}),
      asyncList: DS.belongsTo('list', {async: true, inverse: 'asyncItems'})
    });

    App.ApplicationAdapter = DS.PouchDBAdapter.extend({
      databaseName: 'ember-pouchdb-test'
    });

    store = App.__container__.lookup("store:main");

  },

  teardown: function() {
    App.reset();
  }

});

test('existence', function() {
  expect(1);
  ok(DS.PouchDBAdapter, 'PouchDBAdapter added to DS namespace');
});

asyncTest('error reporting', function() {
  expect(1);
  Ember.run(function(){
    //provoke an error, as _l2 is not a valid id
    var record = store.createRecord('list', { id: '_l2', name: 'two', b: true});
    record.save().then(function() {
      ok(false, 'should have thrown an error');
      start();
    }, function(err){
      ok(true, 'has thrown an error as intended');
      start();
    });
  });
});

asyncTest('create and find', function() {
  expect(1);
  Ember.run(function(){
    var record1 = store.createRecord('list', { id: 'l2', name: 'two', b: true});
    var record2 = store.createRecord('list', { id: 'l1', name: 'one', b: true });

    Ember.RSVP.all([record1.save(), record2.save()]).then(function() {
      App.reset();

      store.find('list', 'l1').then(function(list) {
        equal(list.get('name'), 'one', 'Record loaded');
        start();
      });
    });
  });
});

asyncTest('create and find different models with same id', function() {
  expect(2);
  Ember.run(function(){
    var record1 = store.createRecord('list', { id: 'o1', name: 'two', b: true});

    var record2 = store.createRecord('item', { id: 'o1', name: 'one', list: record1 });

    Ember.RSVP.all([record1.save(), record2.save()]).then(function() {
      App.reset();

      store.find('list', 'o1').then(function(list) {
        equal(list.get('name'), 'two', 'List record should load');
        store.find('item', 'o1').then(function(item) {
          equal(item.get('name'), 'one', 'Item record should load');
          start();
        });
      });
    });
  });
});

asyncTest('create with generated id', function() {
  expect(1);
  Ember.run(function(){
    var record = store.createRecord('list', { name: 'one' });

    record.save().then(function(response) {
      ok(response.get('id').length === 36, 'UUID assigned');
      start();
    });
  });

});

asyncTest('create and find with hasMany', function() {
  expect(1);
  Ember.run(function(){
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var item = store.createRecord('item', { id: 'i1', name: 'one', list: list });

    Ember.RSVP.all([item.save(), list.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.find('list', 'l1').then(function(list) {
        var items = list.get('items');
        equal(items.get('length'), 1, 'hasMany items should load');
        start();
      });
    });
  });
});

asyncTest('create and find with belongsTo', function() {
  expect(2);
  Ember.run(function(){
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var item = store.createRecord('item', { id: 'i1', name: 'one', list: list});

    Ember.RSVP.all([list.save(), item.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.find('item', 'i1').then(function(item) {
        var list = item.get('list');
        ok(list, 'belongsTo item should load');
        equal(list && list.get('id'), 'l1', 'belongsTo item should have its initial properties');
        start();
      });
    });
  });
});

asyncTest('create and find with async belongsTo', function() {
  expect(2);
  Ember.run(function(){
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var item = store.createRecord('item', { id: 'i1', name: 'one', asyncList: list});

    Ember.RSVP.all([list.save(), item.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.find('item', 'i1').then(function(item) {
        item.get('asyncList').then(function(list){
          ok(list, 'belongsTo item should load');
          equal(list && list.get('id'), 'l1', 'belongsTo item should have its initial properties');
          start();
        });
      });
    });
  });
});

asyncTest('create and findMany', function() {
  expect(1);
  Ember.run(function(){
    var list1 = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var list2 = store.createRecord('list', { id: 'l2', name: 'two', b: true });
    var list3 = store.createRecord('list', { id: 'l3', name: 'three', b: true });

    Ember.RSVP.all([list1.save(), list2.save(), list3.save()]).then(function() {
      App.reset();
      store.unloadAll('list');

      store.findByIds('list', ['l1', 'l3']).then(function(lists){
        deepEqual(lists.mapBy('id'), ['l1', 'l3'], 'records with ids should load');
        start();
      });

    });
  });
});

asyncTest('create and update', function() {
  expect(1);
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
  expect(1);
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
  expect(1);
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
  expect(1);
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

asyncTest('create and findAll with hasMany', function() {
  expect(2);
  Ember.run(function(){
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var item = store.createRecord('item', { id: 'i1', name: 'one', list: list });

    Ember.RSVP.all([item.save(), list.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.findAll('list').then(function(lists) {
        equal(lists.get('length'), 1, 'findAll records should load');
        list = lists.content[0];
        var items = list.get('items');
        equal(items.get('length'), 1, 'hasMany items should load');
        start();
      });
    });
  });
});

asyncTest('create and findAll with async hasMany via array', function() {
  expect(2);
  Ember.run(function(){
    var item1 = store.createRecord('item', { id: 'i1', name: 'one' });
    var item2 = store.createRecord('item', { id: 'i2', name: 'two' });
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    list.get('asyncItems').set('content', Ember.A([item1]));

    Ember.RSVP.all([list.save(), item1.save(), item2.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.findAll('list').then(function(lists) {
        equal(lists.get('length'), 1, 'findAll records should load');
        list = lists.content[0];
        list.get('asyncItems').then(function(items){
          equal(items.get('length'), 1, 'async hasMany items should load');
          start();
        });
      });
    });
  });
});

asyncTest('create and findAll with async belongsTo', function() {
  expect(3);
  Ember.run(function(){
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var item1 = store.createRecord('item', { id: 'i1', name: 'one', asyncList: list });
    var item2 = store.createRecord('item', { id: 'i2', name: 'two' });

    Ember.RSVP.all([list.save(), item1.save(), item2.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.findAll('item').then(function(items) {
        equal(items.get('length'), 2, 'findAll records should load');
        item = items.content[0];
        item.get('asyncList').then(function(list){
          ok(list, 'async belongsTo item should load');
          equal(list && list.get('id'), 'l1', 'async belongsTo item should have its initial properties');
          start();
        });
      });
    });
  });
});

asyncTest('create and findAll with async hasMany', function() {
  expect(4);
  Ember.run(function(){
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var item1 = store.createRecord('item', { id: 'i1', name: 'one' });
    var item2 = store.createRecord('item', { id: 'i2', name: 'two' });
    item1.set('asyncList', list);
    //seems like a bug in ember-data, do it until resolved
    list.get('asyncItems').set('content', Ember.A([item1]));

    Ember.RSVP.all([item1.save(), item2.save(), list.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.findAll('list').then(function(lists) {
        equal(lists.get('length'), 1, 'findAll records should load');
        list = lists.content[0];
        equal(list && list.get('id'), 'l1', 'findAll items should load');
        list.get('asyncItems').then(function(items){
          ok(items, 'async hasMany item should be valid');
          equal(items.get('length'), 1, 'async hasMany item should load');
          start();
        });
      });
    });
  });
});

asyncTest('create and delete', function() {
  Ember.run(function(){
    var record = store.createRecord('list', { id: 'l1', name: 'one', b: true });

    record.save().then(function() {
      record.destroyRecord().then(function(record2) {
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
        equal(result.get('type').typeKey, 'list', 'findQuery should look for the correct type');
        equal(result.get('length'), 1, 'Record loaded');
        var content = result.get('content');
        equal(content[0].get('name'), 'two', 'Wrong record loaded');
        start();
      });
    });
  });
});

asyncTest('create and findQueryi by id', function() {
  Ember.run(function(){
    var list1 = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var list2 = store.createRecord('list', { id: 'l2', name: 'two', b: false });

    Ember.RSVP.all([list1.save(), list2.save()]).then(function() {
      App.reset();
      store.unloadAll('list');

      store.find('list', {id: 'l2'}).then(function(result) {
        equal(result.get('type').typeKey, 'list', 'findQuery should look for the correct type');
        equal(result.get('length'), 1, 'Record should load');
        var content = result.get('content');
        equal(content[0].get('name'), 'two', 'Wrong record loaded');
        start();
      });
    });
  });
});

asyncTest('create and findQuery with hasMany', function() {
  Ember.run(function(){
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var item = store.createRecord('item', { id: 'i1', name: 'one', list: list });

    Ember.RSVP.all([item.save(), list.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      store.find('list', {name: 'one'}).then(function(lists) {
        equal(lists.get('type').typeKey, 'list', 'findQuery should look for the correct type');
        equal(lists.get('length'), 1, 'findQuery record should load');
        list = lists.content[0];
        var items = list.get('items');
        equal(items.get('length'), 1, 'hasMany items should load');
        start();
      });
    });
  });
});

asyncTest('delete a record with belongsTo relationship', function() {
  expect(1);
  Ember.run(function(){
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    var item1 = store.createRecord('item', { id: 'i1', name: 'one' });
    var item2 = store.createRecord('item', { id: 'i2', name: 'two' });
    list.get('items').pushObject(item1);
    // list.get('items').pushObject(item2);

    Ember.RSVP.all([item1.save(), item2.save(), list.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');
      store.find('item', 'i1').then(function(item){
        item.destroyRecord().then(function(){
          App.reset();
          store.unloadAll('item');
          store.unloadAll('list');

          store.find('list', 'l1').then(function(list){
            equal(list.get('items.length'), 0, 'deleted relationships should not appear');
            start();
          });
        });
      });
    });
  });
});

asyncTest('delete a record with hasMany relationship', function() {
  expect(1);
  Ember.run(function(){
    var item1 = store.createRecord('item', { id: 'i1', name: 'one' });
    var item2 = store.createRecord('item', { id: 'i2', name: 'two' });
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    list.get('items').pushObject(item1);

    Ember.RSVP.all([item1.save(), item2.save(), list.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');
      store.find('list', 'l1').then(function(list){
        list.destroyRecord().then(function(){
          App.reset();
          store.unloadAll('item');
          store.unloadAll('list');

          store.find('item', 'i1').then(function(item){
            equal(item.get('list'), null, 'deleted relationship should not appear');
            start();
          });
        });
      });
    });
  });
});

asyncTest('change hasMany relationship', function() {
  expect(4);
  Ember.run(function(){
    var item1 = store.createRecord('item', { id: 'i1', name: 'one' });
    var item2 = store.createRecord('item', { id: 'i2', name: 'two' });
    var list = store.createRecord('list', { id: 'l1', name: 'one', b: true });
    list.get('items').pushObject(item1);

    Ember.RSVP.all([item1.save(), item2.save(), list.save()]).then(function() {
      App.reset();
      store.unloadAll('item');
      store.unloadAll('list');

      Ember.RSVP.hash({
        list: store.find('list', 'l1'),
        item2: store.find('item', 'i2')
      }).then(function(res){
        list = res.list;
        item2 = res.item2;
        equal(list.get('items.firstObject.name'), 'one', "unchanged relationship should keep the original record");
        list.get('items').clear();
        list.get('items').pushObject(item2);

        list.save().then(function(){
          App.reset();
          store.unloadAll('item');
          store.unloadAll('list');

          Ember.RSVP.hash({
            list: store.find('list', 'l1'),
            item1: store.find('item', 'i1'),
            item2: store.find('item', 'i2')
          }).then(function(res){
            list = res.list;
            item1 = res.item1;
            item2 = res.item2;
            equal(list.get('items.firstObject.name'), 'two', "changed relationship should reflect the change");
            equal(item1.get('list.id'), null, "old relationship shouldn't exist");
            equal(item2.get('list.id'), 'l1', "new relationship should exist");
            start();
          });
        });
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
