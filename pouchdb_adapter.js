(function() {
  var get = Ember.get, set = Ember.set;
  var map = Ember.EnumerableUtils.map;
  var forEach = Ember.EnumerableUtils.forEach;

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
      json._rev = get(record, 'data')['_rev'];
      // Store the type in the value so that we can index it on read
      json['emberDataType'] = Ember.String.decamelize(record.constructor.typeKey);
      json[get(this, 'primaryKey')] = get(record, 'id') + "_"+record.constructor.typeKey;
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

    normalize: function(type, hash) {
      hash.id = hash.id || hash._id;
      if(hash.id && hash.id.endsWith("_"+type.typeKey)){
        hash.id = hash['id'].split("_").slice(0, -1).join("_");
      }
      delete hash._id;

      return this._super(type, hash);
    },

    extractSingle: function(store, type, payload) {
      payload = this.normalize(type, payload);
      type.eachRelationship(function(accessor, relationship){
        if(relationship.kind == "hasMany" && payload[accessor]){
          payload[accessor] = Ember.A(payload[accessor]);
        }
      });

      return this._super(store, type, payload);
    },

    extractArray: function(store, type, payload){
      delete payload['type'];
      var array =  map(payload, function(hash){
        return this.extractSingle(store, type, hash);
      }, this);

      return this._super(store, type, array);
    },

    normalizePayload: function(type, payload) {
      return payload;
    },

    pushPayload: function(store, payload) {
      payload = this.normalizePayload(null, payload);

      for (var prop in payload) {
        var typeName = this.typeForRoot(prop),
          type = store.modelFor(typeName);

        var normalizedArray = map(payload[prop], function(hash) {
          return this.normalize(type, hash, prop);
        }, this);
        store.pushMany(typeName, normalizedArray);
      }
    }
  });

  /**
   * Initially based on https://github.com/panayi/ember-data-indexeddb-adapter and https://github.com/wycats/indexeddb-experiment
   *
   */
  DS.PouchDBAdapter = DS.Adapter.extend({
    defaultSerializer: "_pouchdb",
    keysInFlight: [],

    /**
     Hook used by the store to generate client-side IDs. This simplifies
     the timing of committed related records, so it's preferable.

     For this adapter, we use uuid.js by Rober Kieffer, which generates
     UUIDs using the best-available random number generator.

     @returns {String} a UUID
     */
    generateIdForRecord: function() {
      return uuid();
    },

    /**
     Main hook for saving a newly created record.

     @param {DS.Store} store
     @param {Class} type
     @param {DS.Model} records
     */
    createRecord: function(store, type, record) {
      var self = this,
          data = self.serialize(record, { includeId: true, includeType: true});

      return new Ember.RSVP.Promise(function(resolve, reject){
        self._getDb().put(data, function(err, response) {
          if (!err) {
            data = Ember.copy(data, true);
            data._rev = response.rev;
            Ember.run(null, resolve, data);
          } else {
            err = self._errMsg(err);
            Ember.run(null, reject, err);
          }
        });
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
          hash = this.serialize(record, { includeId: true, includeType: true });

      return new Ember.RSVP.Promise(function(resolve, reject){
        self._getDb().put(hash, function(err, response) {
          if (!err) {
            hash = Ember.copy(hash);
            hash._rev = response.rev;
            Ember.run(null, resolve, hash);
          } else {
            err = self._errMsg(err);
            Ember.run(null, reject, err);
          }
        });
      });
    },

    deleteRecord: function(store, type, record) {
      var self = this,
          hash = this.serialize(record, { includeId: true, includeType: true });

      return new Ember.RSVP.Promise(function(resolve, reject){
        self._getDb().remove(hash, function(err, response) {
          if (err) {
            err = self._errMsg(err);
            Ember.run(null, reject, err);
          } else {
            hash = Ember.copy(hash);
            hash._rev = response.rev;
            Ember.run(null, resolve, hash);
          }
        });
      });
    },

    find: function(store, type, id) {
      return this.findMany(store, type, [id]).then(function(data){
        return data[0] || {};
      });
    },

    findMany: function(store, type, ids) {
      var self = this,
          db = this._getDb(),
          data = Ember.A();

      data['type'] = type.typeKey;
      ids = ids.map(function(id){
        return id + "_" + type.typeKey;
      });

      return new Ember.RSVP.Promise(function(resolve, reject){
        db.allDocs({keys: ids, include_docs: true}, function(err, response) {
          if (err) {
            err = self._errMsg(err);
            Ember.run(null, reject, err);
          } else {
            if (response.rows) {
              response.rows.forEach(function(row) {
                if(!row["error"]){
                  data.push(row.doc);
                } else {
                  console.log('cannot find', row.key +":", row.error);
                }
              });
            }
            self._preloadRelationships.call(self, store, type, data, function(data){
              Ember.run(null, resolve, data);
            });
          }
        });
      });
    },

    findAll: function(store, type, sinceToken) {
      var self = this,
          db = this._getDb(),
          data = Ember.A();

      return new Ember.RSVP.Promise(function(resolve, reject){
        db.query({map: function(doc) {
          if (doc['emberDataType']) {
            emit(doc['emberDataType'], null);
          }
        }}, {reduce: false, key: type.typeKey, include_docs: true}, function(err, response) {
          if (err) {
            err = self._errMsg(err);
            Ember.run(null, reject, err);
          } else {
            if (response.rows) {
              response.rows.forEach(function(row) {
                if(!row["error"]){
                  data.push(row.doc);
                } else {
                  console.log('cannot find', row.key +":", row.error);
                }
              });
            }
            self._preloadRelationships.call(self, store, type, data, function(data){
              Ember.run(null, resolve, data);
            });
          }
        });
      });
    },

    findQuery: function(store, type, query, array) {
      var self = this,
          db = this._getDb();

      // select direct attributes only
      var keys = [];
      for (key in query) {
        if (query.hasOwnProperty(key)) {
          keys.push(key);
        }
      }

      var emitKeys = keys.map(function(key) {
        if(key == "id") key = "_id";
        return 'doc.' + key;
      });
      var queryKeys = keys.map(function(key) {
        if(key == "_id" || key == "id") {
          return query[key] + "_" + type.typeKey;
        }
        return query[key];
      });

      // Very simple map function for a conjunction (AND) of all keys in the query
      var mapFn = 'function(doc) {' +
            'if (doc["emberDataType"]) {' +
              'emit([doc["emberDataType"]' + (emitKeys.length > 0 ? ',' : '') + emitKeys.join(',') + '], null);' +
            '}' +
          '}';

      return new Ember.RSVP.Promise(function(resolve, reject){
        db.query({map: mapFn}, {reduce: false, key: [].concat(type.typeKey, queryKeys), include_docs: true}, function(err, response) {
          if (err) {
            err = self._errMsg(err);
            Ember.run(null, reject, err);
          } else {
            if (response.rows) {
              var data = Ember.A(response.rows).mapBy('doc');
              self._preloadRelationships.call(self, store, type, data, function(data){
                Ember.run(null, resolve, data);
              });
            }
          }
        });
      });
    },

    // private

    /**
     * Preload relationship records
     * @private
     */
    _preloadRelationships: function(store, type, data, done){
      var self = this;

      var promises = Ember.A();
      type.eachRelationship(function(accessor, relationship){
        forEach(data, function(d){
          var keys = d[accessor];
          var rtype = relationship.type;
          if(!Ember.isArray(keys)){
            keys = [keys];
          };

          //exclude the main record from sideloading
          var current_if_key = d._id;
          if($.inArray(current_if_key, self.keysInFlight) == -1){
            self.keysInFlight.push(current_if_key);
          }

          //ignore all the cached and already sideloading records
          keys = $.grep(keys, function(id){
            var if_key = id + "_" + rtype.typeKey;
            var notInFlight = $.inArray(if_key, self.keysInFlight) == -1;
            if(store.hasRecordForId(rtype, id) === false && notInFlight){
              self.keysInFlight.push(if_key);
              return true;
            }
            return false;
          });

          //load unloaded relationship records from pouchDB
          if(!Ember.isEmpty(keys)){
            var promise = self.findMany(store, rtype, keys);
            promises.push(promise);
          }
        });
      });

      if(promises.length > 0){
        Ember.run(null, function(data){
          Ember.RSVP.all(promises).then(function(results){
            forEach(results, function(r){
              var type = r['type'];
              delete r['type'];
              var payload = {};
              payload[Ember.String.pluralize(Ember.String.decamelize(type))] = r;
              store.pushPayload(type, payload);
              r.forEach(function(k){
                var ifpos = $.inArray(k.id+"_"+type, self.keysInFlight);
                if(ifpos >= 0){
                  delete self.keysInFlight[ifpos];
                }
              });

            });
            if((typeof done) == "function"){
              done(data);
            }
          });
        }, data);
      } else {
        if((typeof done) == "function"){
          done(data);
        }
      }
    },


    /**
     * Lazily create a PouchDB instance
     *
     * @returns {PouchDB}
     * @private
     */
    _getDb: function() {
      if (!this.db) {
        this.db = new PouchDB(this.databaseName || 'ember-application-db');
      }
      return this.db;
    },

    /**
     * Formats PouchDB error hash
     *
     * @returns String
     * @private
     */
    _errMsg: function(err){
      return [err["status"], err["error"]+":", err["reason"]].join(" ");
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
