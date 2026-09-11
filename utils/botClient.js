let _client = null;
module.exports = {
  set: (c) => { _client = c; },
  get: () => _client
};
