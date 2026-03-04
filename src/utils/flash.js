function setFlash(req, type, text) {
  req.session.flash = { type, text };
}

module.exports = { setFlash };
