/*************************************************************************************
  Copyright (c) 2014 Paul Koch <my.shando@gmail.com>

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell 
  copies of the Software, and to permit persons to whom the Software is 
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN 
  THE SOFTWARE.

  Ember PouchDB Adapter 
  Author: kulpae <my.shando@gmail.com> 

*************************************************************************************/
(function() {
  var get = Ember.get, set = Ember.set;
  var map = Ember.ArrayPolyfills.map;
  var forEach = Ember.ArrayPolyfills.forEach;

  function idToPouchId(id, type){
    type = type.typeKey || type;
    return [type, id].join("_");
  }

  function pouchIdToId(id){
    var idx = id.indexOf("_");
    return (idx === -1)? id : id.substring(idx+1);
  }

  DS.PouchDBSerializer = DS.JSONSerializer.extend({
    primaryKey: '_id',

    typeForRoot: function(root) {
      var camelized = Ember.String.camelize(root);
      return Ember.String.singularize(camelized);
    },

    /**
     * Override to get the document revision that is stored on the record for PouchDB updates
     */
    serialize: function(record, options) {
      var json = this._super(record, options);
      json._rev = get(record, 'data._rev');
      //append the type to _id, so that querying by type can utilize the order
      json[get(this, 'primaryKey')] = idToPouchId(get(record, 'id'), record.constructor);
      return json;
    },

    serializeHasMany: function(record, json, relationship){
      this._super(record, json, relationship);

      var key = relationship.key;
      var relationshipType = DS.RelationshipChange.determineRelationshipType(record.constructor, relationship);
      if (relationshipType === 'manyToOne') {
        json[key] = get(record, key).mapBy('id').concat([]);
      }
    },

    serializeBelongsTo: function(record, json, relationship) {
      this._super(record, json, relationship);
    },

    normalize: function(type, hash) {
      if(Ember.isEmpty(hash)) return hash;
      hash.id = hash.id || hash._id;
      if(hash.id){
        hash.id = pouchIdToId(hash.id);
      }
      delete hash._id;

      return this._super(type, hash);
    },

    extractSingle: function(store, type, payload, id) {
      payload = this.normalize(type, payload);
      type.eachRelationship(function(accessor, relationship){
        if(relationship.kind == "hasMany" && payload[accessor]){
          payload[accessor] = Ember.A(payload[accessor]);
        }
      });

      if(payload['_embedded']){
        var sideload = payload._embedded;
        delete payload._embedded;
        for(prop in sideload){
          if(!sideload.hasOwnProperty(prop)) next;
          var typeName = this.typeForRoot(prop),
              type = store.modelFor(typeName),
              typeSerializer = store.serializerFor(type);

          forEach.call(sideload[prop], function(hash){
            hash = typeSerializer.normalize(type, hash);
            store.push(typeName, hash);
          });
        }
      }
      return this._super(store, type, payload);
    },

    extractArray: function(store, type, payload){
      var array =  map.call(payload, function(hash){
        return this.extractSingle(store, type, hash);
      }, this);

      return this._super(store, type, array);
    }
  });

  function _pouchError(reject){
    return function(err){
      var errmsg = [  err["status"], 
                     (err["name"] || err["error"])+":",
                     (err["message"] || err["reason"])
                   ].join(" ");
      Ember.run(null, reject, errmsg);
    }
  }

  /**
   * Initially based on https://github.com/panayi/ember-data-indexeddb-adapter and https://github.com/wycats/indexeddb-experiment
   * then based on https://github.com/chlu/ember-pouchdb-adapter
   */
  DS.PouchDBAdapter = DS.Adapter.extend({
    defaultSerializer: "_pouchdb",

    init: function(){
      this._super();
    },

    /**
     Hook used by the store to generate client-side IDs. This simplifies
     the timing of committed related records, so it's preferable.

     @returns {String} a UUID
     */
    generateIdForRecord: function() {
      return PouchDB.utils.uuid();
    },

    /**
     Main hook for saving a newly created record.

     @param {DS.Store} store
     @param {Class} type
     @param {DS.Model} records
     */
    createRecord: function(store, type, record) {
      var self = this,
          id = get(record, 'id'),
          hash = self.serialize(record, { includeId: true });

      //having _rev would make an update and produce a missing revision
      delete hash._rev;

      return new Ember.RSVP.Promise(function(resolve, reject){
        self._getDb().then(function(db){
          db.put(hash, function(err, response) {
            if (!err) {
              hash = Ember.copy(hash, true);
              hash._rev = response.rev;
              Ember.run(null, resolve, hash);
            } else {
              _pouchError(reject)(err);
            }
          });
        }, _pouchError(reject));
      });
    },

    /**
     Main hook for updating an existing record.

     @param {DS.Store} store
     @param {Class} type
     @param {DS.Model} record
     */
    updateRecord: function(store, type, record) {
      var self = this,
          id = get(record, 'id'),
          hash = this.serialize(record, { includeId: true });

      return new Ember.RSVP.Promise(function(resolve, reject){
        self._getDb().then(function(db){
          db.get(hash['_id'], function(getErr, oldHash){
            db.put(hash, function(err, response) {
              if (!err) {
                hash = Ember.copy(hash);
                hash._rev = response.rev;
                self._updateRelationships(id, type, oldHash, hash).then(function(){
                  Ember.run(null, resolve, hash);
                });
              } else {
                pouchError(reject)(err);
              }
            });
          });
        }, _pouchError(reject));
      });
    },

    deleteRecord: function(store, type, record) {
      var self = this,
          id = record.get('id'),
          hash = this.serialize(record, { includeId: true });
      
      return new Ember.RSVP.Promise(function(resolve, reject){
        self._getDb().then(function(db){
          db.get(hash['_id'], function(getErr, oldHash){
            db.remove(hash, function(err, response) {
              if (err) {
                _pouchError(reject)(err);
              } else {
                hash = Ember.copy(hash);
                hash._rev = response.rev;
                self._updateRelationships(id, type, oldHash, {}).then(function(){
                  Ember.run(null, resolve, hash);
                });
              }
            });
          });
        }, _pouchError(reject));
      });
    },

    find: function(store, type, id) {
      return this.findMany(store, type, [id]).then(function(data){
        return data[0] || {};
      });
    },

    findMany: function(store, type, ids, options) {
      var self = this,
          data = Ember.A();

      if(!options) options = {};
      if(Ember.typeOf(options) != 'object') options = {param: options};
      if(Ember.isNone(options.embed)) options.embed = true;

      ids = map.call(ids, function(id){
        return idToPouchId(id, type);
      });

      return new Ember.RSVP.Promise(function(resolve, reject){
        self._getDb().then(function(db){
          var promises = [];
          forEach.call(ids, function(id){
            var deferred = Ember.RSVP.defer();
            promises.push(deferred.promise);
            db.allDocs({key: id, include_docs: true}, function(err, response){
              if(err){
                Ember.run(null, deferred.reject, err);
              } else {
                Ember.run(null, deferred.resolve, response);
              }
            });
          });

          Ember.RSVP.all(promises).then(function(responses){
            forEach.call(responses, function(response){
              if (response.rows) {
                forEach.call(response.rows, function(row) {
                  if(!row["error"]){
                    data.push(row.doc);
                  }
                });
              }
            });
            Ember.run(function(){
              self._resolveRelationships(store, type, data, options).then(function(data){
                Ember.run(null, resolve, data);
              });
            });
          }, _pouchError(reject));
        }, _pouchError(reject));
      });
    },

    findAll: function(store, type, options) {
      var self = this,
          start = type.typeKey,
          end = start + '~~',
          data = Ember.A();

      if(!options) options = {};
      if(Ember.typeOf(options) != 'object') options = {since: options};
      if(Ember.isNone(options.embed)) options.embed = true;

      return new Ember.RSVP.Promise(function(resolve, reject){
        self._getDb().then(function(db){
          db.allDocs({include_docs: true, startkey: start, endkey: end}, function(err, response){
            if (err) {
              _pouchError(reject)(err);
            } else {
              if (response.rows) {
                forEach.call(response.rows, function(row) {
                  if(!row["error"]){
                    data.push(row.doc);
                  } else {
                    console.log('cannot find', row.key +":", row.error);
                  }
                });
              }
              Ember.run(function(){
                self._resolveRelationships(store, type, data, options).then(function(data){
                  Ember.run(null, resolve, data);
                });
              });
            }
          });
        }, _pouchError(reject));
      });
    },

    findQuery: function(store, type, query, options) {
      var self = this;

      if(!options) options = {};
      if(Ember.isArray(options)) options = {array: options};
      if(Ember.typeOf(options) != 'object') options = {param: options};
      if(Ember.isNone(options.embed)) options.embed = true;

      // select direct attributes only
      var keys = [];
      for (key in query) {
        if (query.hasOwnProperty(key)) {
          keys.push(key);
        }
      }

      var emitKeys = map.call(keys, function(key) {
        if(key == "id") key = "_id";
        return 'doc.' + key;
      });
      var queryKeys = map.call(keys, function(key) {
        if(key == "_id" || key == "id") {
          return idToPouchId(query[key], type);
        }
        return query[key];
      });

      // Very simple map function for a conjunction (AND) of all keys in the query
      var mapFn = 'function(doc) {' +
            'if (doc._id.indexOf("_") > 0) {' +
              'var type = doc._id.substring(0, doc._id.indexOf("_"));' +
              'emit([type' + (emitKeys.length > 0 ? ',' : '') + emitKeys.join(',') + '], null);' +
            '}' +
          '}';

      var startK = type.typeKey,
          endK = startK + "~";

      return new Ember.RSVP.Promise(function(resolve, reject){
        self._getDb().then(function(db){
          db.query({map: mapFn}, 
                   {reduce: false, startkey: [startK], endkey: [endK], key: [].concat(startK, queryKeys), include_docs: true}, 
                   function(err, response) {
            if (err) {
              _pouchError(reject)(err);
            } else {
              if (response.rows) {
                var data = Ember.A(response.rows).mapBy('doc');
                Ember.run(function(){
                  self._resolveRelationships(store, type, data, options).then(function(data){
                    Ember.run(null, resolve, data);
                  });
                });
              }
            }
          });
        }, _pouchError(reject));
      });
    },

    // private

    /**
     * Fetch hasMany relationship ids and assign them to data.
     * @param {DS.Store} store
     * @param {Class} type object type
     * @param {Array} items collection of non-normalized objects
     * @param {Function} completeFunc called when operation is done
     * @private
     */
    _resolveRelationships: function(store, type, items, options){
      if(options && options.embed !== true){
        return Ember.RSVP.resolve(items);
      }

      // items = Ember.copy(items, true);
      var serializer = store.serializerFor(type);
      var promises = Ember.A();
      var self = this;

      forEach.call(items, function(item){
        //extract the id
        var itemId = serializer.normalize(type, {_id: item._id}).id;
        type.eachRelationship(function(key, relationship){
          var isSync = Ember.isNone(relationship.options.async);
          var relType = relationship.type;
          if(isSync && !Ember.isEmpty(get(item,key))){
            var itemKeys = Ember.makeArray(get(item, key));
            var deferred = self.findMany(store, relType, itemKeys, {embed: false});
            deferred.then(function(relations){
              if(!Ember.isEmpty(relations)){
                if(!item['_embedded']){
                  item['_embedded'] = {};
                }
                item['_embedded'][relType.typeKey] = Ember.makeArray(relations);
              }
            });
            promises.push(deferred);
          }
        });
      });

      return Ember.RSVP.all(promises).then(function(results){
        return items;
      });
    },

    _updateRelationships: function(recordId, recordType, oldHash, newHash){
      var promises = [];
      var self = this;

      function updateBelongsTo(recId, recType, key, newVal, oldVal){
        if(newVal === oldVal) return null;

        var deferred = Ember.RSVP.defer();
        self._getDb().then(function(db){
          db.get(idToPouchId(recId, recType), function(err, data){
            if(err){
              deferred.reject(err);
            } else {
              var other = data;
              if(other[key] === oldVal && other[key] !== newVal){
                other[key] = newVal;
                db.put(other, function(err, res){
                  if(err){
                    deferred.reject(err);
                  } else {
                    deferred.resolve();
                  }
                });
              } else {
                deferred.resolve();
              }
            }
          });
        }, deferred.reject);
        return deferred.promise;
      };

      function updateHasMany(recId, recType, key, newVal, oldVal){
        if(newVal === oldVal || !(oldVal || newVal)) return null;

        var deferred = Ember.RSVP.defer();
        self._getDb().then(function(db){
          db.get(idToPouchId(recId, recType), function(err, data){
            if(err){
              deferred.reject(err);
            } else {
              var other = data;
              if(other[key].indexOf && 
                 (oldVal && other[key].indexOf(oldVal) >= 0) ||
                 (newVal && other[key].indexOf(newVal) == -1)){
                if(oldVal) {
                  var index = other[key].indexOf(oldVal);
                  delete other[key][index];
                }
                if(newVal) {
                  other[key].push(newVal);
                }
                db.put(other, function(err, res){
                  if(err){
                    deferred.reject(err);
                  } else {
                    deferred.resolve();
                  }
                });
              } else {
                deferred.resolve();
              }
            }
          });
        }, deferred.reject);
        return deferred.promise;
      };

      recordType.eachRelationship(function(key, rel){
        var inverse = recordType.inverseFor(key);
        var otherKey, otherKind;
        var otherType = rel.type;
        var recordData;
        var updateMethod;
        // for oneToNone or manyToNone there is nothing to do
        if(inverse){
          otherKey = inverse.name;
          otherKind = inverse.kind;
          //works the same for records belongsTo and hasMany relationships
          //differentiates between others relationship kind only

          if(otherKind === "belongsTo"){
            updateMethod = updateBelongsTo;
          } else {
            updateMethod = updateHasMany;
          }
          var othersOld = Ember.makeArray(oldHash[key]);
          var othersNew = Ember.makeArray(newHash[key]);
          var idsWithRemovedRel = Ember.A(othersOld).reject(function(id){
            return othersNew.indexOf(id) >= 0;
          });
          var idsWithAddedRel = Ember.A(othersNew).reject(function(id){
            return othersOld.indexOf(id) >= 0;
          });
          //remove old unlinked relationship(s)
          forEach.call(idsWithRemovedRel, function(o){
            promises.push(updateMethod(o, otherType, otherKey, null, recordId));
          });
          //add new linked relationship(s)
          forEach.call(idsWithAddedRel, function(o){
            promises.push(updateMethod(o, otherType, otherKey, recordId, null));
          });
        }
      });

      return Ember.RSVP.all(promises);
    },

    /**
     * Lazily create a PouchDB instance
     *
     * @returns Promise that resolves to {PouchDB}
     * @private
     */
    _getDb: function() {
      var self = this;
      if(self.db && self.db.then) return self.db;

      var promise = new Ember.RSVP.Promise(function(resolve, reject){
        if (!self.db) {
          new PouchDB(self.databaseName || 'ember-application-db', function(err, db){
            if(err){
              Ember.run(null, reject, err);
            } else {
              self.db = db;
              Ember.run(null, resolve, db);
            }
          });
        } else {
          Ember.run(null, resolve, self.db);
        }
      });
      
      if (!self.db) {
        self.db = promise;
      }
      return promise;
    }
  });

})();


/**
 * Registers PouchDB adapter and serializer to emberjs.
 */
(function() {
Ember.onLoad('Ember.Application', function(Application) {
  Application.initializer({
    name: "PouchDBAdapter",

    initialize: function(container, application) {
      application.register('serializer:_pouchdb', DS.PouchDBSerializer);
      application.register('adapter:_pouchdb', DS.PouchDBAdapter);
    }
  });
});

})();
