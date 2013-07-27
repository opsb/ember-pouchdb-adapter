// global variables
var List, list, lists,
    Item, item, items,
    store, adapter, clock;

module('DS.PouchDBAdapter', {

  setup: function() {
    stop();

    PouchDB.destroy('ember-pouchdb-test', function() {
      start();
    });

    List = DS.Model.extend({
      name: DS.attr('string'),
      b: DS.attr('boolean')
    });

    List.toString = function() {
      return 'App.List';
    };

    Item = DS.Model.extend({
      name: DS.attr('string')
    });

    Item.toString = function() {
      return 'App.Item';
    };

    List.reopen({
      items: DS.hasMany(Item)
    });

    Item.reopen({
      list: DS.belongsTo(List)
    });

    adapter = DS.PouchDBAdapter.create({
      databaseName: 'ember-pouchdb-test'
    });

    store = DS.Store.create({adapter: adapter});
      // FIXME We somehow have to set this explicitly
    DS.set('defaultStore', store);
  },

  teardown: function() {
    adapter.destroy();
    store.destroy();

    list = null;
    lists = null;
  }

});

test('existence', function() {
  ok(DS.PouchDBAdapter, 'PouchDBAdapter added to DS namespace');
});

asyncTest('create and find', function() {
  var transaction = store.transaction();
  var record = transaction.createRecord(List, { id: 'l1', name: 'one', b: true, items: [] });

  record.one('didCreate', function() {
      // FIXME This is a hack to reset the internal id map for loaded models
    store.typeMaps = {};

    list = List.find('l1');
    list.one('didLoad', function() {
      ok(true, 'Record loaded');
      start();
    });
  });

  transaction.commit();
});

asyncTest('create and find with many', function() {
  var transaction = store.transaction();
  var list = transaction.createRecord(List, { id: 'l1', name: 'one', b: true });
  transaction.createRecord(Item, { id: 'i1', name: 'one', list: list });

  list.one('didCreate', function() {
      // FIXME This is a hack to reset the internal id map for loaded models
    store.typeMaps = {};

    list = List.find('l1');
    list.one('didLoad', function() {
      var items = list.get('items');
      equal(items.get('length'), 1, 'hasMany items should be loaded');
      start();
    });
  });

  transaction.commit();
});

/*
test('findMany', function() {
  lists = store.findMany(List, ['l1', 'l3']);
  clock.tick(1);
  assertStoredLists();
});

test('findQuery', function() {
  lists = store.findQuery(List, {name: /one|two/});
  assertQuery(2);

  lists = store.findQuery(List, {name: /.+/, id: /l1/});
  assertQuery();

  lists = store.findQuery(List, {name: 'one'});
  assertQuery();

  lists = store.findQuery(List, {b: true});
  assertQuery();
});

test('findAll', function() {
  lists = store.findAll(List);
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

  lists = store.findAll(List);
  clock.tick(1);

  assertListsLength(3);
});

test('bulkCommits changes', function() {
  var listToUpdate = List.find('l1');
  var listToDelete = List.find('l2');
  List.createRecord({name: 'bulk new'}); // will find later

  clock.tick(1);

  listToUpdate.set('name', 'updated');
  listToDelete.deleteRecord();

  commit();

  var updatedList = List.find('l1');
  var newListQuery = store.findQuery(List, {name: 'bulk new'});
  clock.tick(1);
  var newList = newListQuery.objectAt(0);

  assertState('deleted', true, listToDelete);
  assertListNotFoundInStorage(listToDelete);
  assertStoredList(updatedList);
  assertStoredList(newList);
});

test('load hasMany association', function() {
  list = List.find('l1');
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
  list = List.find('l1');
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

  list = List.createRecord({name: n100k});

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