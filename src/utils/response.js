function success(res, data, message = "OK") {
  return res.json({ status: "ok", message, data });
}

function error(res, err, code = 500) {
  return res.status(code).json({ status: "error", message: err.message || err });
}

module.exports = { success, error };
