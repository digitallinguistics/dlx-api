/* eslint-disable
  camelcase,
  func-names,
  handle-callback-err,
  max-nested-callbacks,
  max-statements-per-line,
  prefer-arrow-callback,
*/

const config         = require(`../lib/config`);
const getToken       = require(`./token`);
const io             = require(`socket.io-client`);
const upsertDocument = require(`./upsert`);

module.exports = (req, v = ``) => {

  describe(`Socket API`, function() {

    let client;
    let token;
    const test = true;

    const authenticate = token => new Promise((resolve, reject) => {

      const socketOpts = { transports: [`websocket`, `xhr-polling`] };
      const client     = io(`${config.baseUrl}${v}`, socketOpts);

      client.on(`authenticated`, () => resolve(client));
      client.on(`connect`, () => client.emit(`authenticate`, { token }));
      client.on(`error`, reject);
      client.on(`unauthorized`, reject);

    });

    beforeAll(function(done) {
      getToken()
      .then(result => {
        token = result;
        return token;
      })
      .then(authenticate)
      .then(result => { client = result; })
      .then(done)
      .catch(fail);
    });

    // FEATURES
    xit(`supports pagination`, function(done) {

      const getFirstPage = () => new Promise((resolve, reject) => {
        client.emit(`getAll`, `Language`, { maxItemCount: 10 }, (err, res, info) => {
          if (err) return reject(err);
          expect(res.length).toBe(10);
          expect(info.continuation).toBeDefined();
          resolve(info.continuation);
        });
      });

      const getSecondPage = continuation => new Promise((resolve, reject) => {
        client.emit(`getAll`, `Language`, { continuation }, (err, res) => {
          expect(res.length).toBeGreaterThan(0);
          if (err) reject(err);
          else resolve();
        });
      });

      Array(15)
      .fill({})
      .reduce(p => p.then(() => upsertDocument({
        permissions: { public: true },
        test: true,
        type: `Language`,
      })), Promise.resolve())
      .then(getFirstPage)
      .then(getSecondPage)
      .then(done)
      .catch(fail);

    }, 10000);

    xit(`304: Not Modified`, function(done) {

      const lang = {
        permissions: { public: true },
        test: true,
        // don't set a ttl here
      };

      const testETag = data => new Promise((resolve, reject) => {
        client.emit(`get`, `Language`, data.id, { ifNoneMatch: data._etag }, (err, res) => {
          expect(err.status).toBe(304);
          if (err) resolve();
          else reject(res);
        });
      });

      upsertDocument(lang)
      .then(testETag)
      .then(done)
      .catch(fail);

    });

    // GENERIC CRUD METHODS

    xit(`add`, function(done) {

      const lang = {
        test,
        testName: `add`,
      };

      client.emit(`add`, `Language`, lang, (err, res) => {
        expect(res.testName).toBe(lang.testName);
        done();
      });

    });

    xit(`delete`, function(done) {

      const data = {
        permissions: { owner: [config.testUser] },
        test,
        testName: `delete`,
      };

      const destroy = id => new Promise((resolve, reject) => {
        client.emit(`delete`, id, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });

      upsertDocument(data)
      .then(lang => destroy(lang.id))
      .then(done)
      .catch(fail);

    });

    xit(`get`, function(done) {

      const data = {
        permissions: { owner: [config.testUser] },
        test,
        testName: `delete`,
      };

      const get = id => new Promise((resolve, reject) => {
        client.emit(`get`, `Language`, id, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });

      upsertDocument(data)
      .then(lang => get(lang.id))
      .then(done)
      .catch(fail);

    });

    xit(`getAll`, function(done) {

      const lang1 = {
        permissions: { owner: [`some-other-user`] },
        test: true,
        testName: `GET languages test`,
      };

      const lang2 = {
        permissions: { public: true },
        test: true,
      };

      const filter = results => results.filter(item => item.testName === lang1.testName);

      const getAll = () => new Promise((resolve, reject) => {
        client.emit(`getAll`, `Language`, (err, res) => {
          if (err) return reject(err);
          expect(res.length).toBeGreaterThan(0);
          expect(filter(res).length).toBe(0);
          resolve();
        });
      });

      upsertDocument(lang1)
      .then(() => upsertDocument(lang2))
      .then(getAll)
      .then(done)
      .catch(fail);

    });

    xit(`update`, function(done) {

      const lang = {
        notChanged: `This property should not be changed.`,
        permissions: { owner: [config.testUser] },
        testName: `upsertOne`,
        ttl: 500,
      };

      const update = data => new Promise((resolve, reject) => {

        const newData = {
          id: data.id,
          testName: `upsertOneAgain`,
        };

        client.emit(`update`, `Language`, newData, (err, res) => {
          if (err) reject(err);
          expect(res.notChanged).toBe(lang.notChanged);
          expect(res.testName).toBe(newData.testName);
          resolve(res);
        });

      });

      upsertDocument(lang)
      .then(update)
      .then(done)
      .catch(fail);

    });

    xit(`upsert`, function(done) {

      const lang = {
        permissions: { owner: [config.testUser] },
        testName: `upsert`,
        ttl: 500,
      };

      client.emit(`upsert`, `Language`, lang, (err, res) => {
        expect(res.testName).toBe(lang.testName);
        done();
      });

    });

    xit(`receives deleted data`, function(done) {

      let id;

      const deleteDocument = id => req.delete(`${v}/languages/${id}`)
      .set(`Authorization`, `Bearer ${token}`)
      .expect(204);

      client.on(`delete`, data => {
        expect(data).toBe(id);
        done();
      });

      const data = {
        permissions: { owner: [config.testUser] },
        test,
        testName: `receive data`,
      };

      upsertDocument(data)
      .then(lang => {
        id = lang.id;
        return deleteDocument(lang.id);
      })
      .catch(fail);

    });

    it(`does not receive deleted data`, function(done) {

      // TODO
      // - create a public token
      // - create a new client
      // - authenticate the new client with the public token (and save a reference to the client)
      // - add listener: client.on(`delete`, fail);
      // - upsert the test document, with testUser as owner
      // - delete the document using the REST API, with the testUser's token
      // - setTimeout to call `done()` after 2.5s

      const data = {
        permissions: { owner: [config.testUser] },
        test,
        testName: `receive data`,
      };

      const deleteDocument = id => req.delete(`${v}/languages/${id}`)
      .set(`Authorization`, `Bearer ${token}`)
      .expect(204);

      client.on(`delete`, data => {
        fail(data);
      });

      authenticate(token)
      .then(() => upsertDocument(data))
      .then(lang => deleteDocument(lang.id))
      .then(() => setTimeout(done, 2500))
      .catch(fail);

    }, 10000);

    it(`receives updated data`, function(done) {

      pending(`Functionality not yet added.`);

      const data = {
        test,
        testName: `getUpdatedData`,
      };

    });

    it(`does not receive updated data`, function(done) {
      pending(`Functionality not yet added.`);
      // TODO: check that it receives updates it should, and does not receive updates it shouldn't
    });

    it(`receives upserted data`, function() {
      pending(`Functionality not yet added.`);
    });

    it(`does not receive upserted data`, function(done) {
      pending(`Functionality not yet added.`);
      // TODO: check that it receives updates it should, and does not receive updates it shouldn't
    });

  });

};
