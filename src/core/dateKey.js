function pad(value) {
  return String(value).padStart(2, '0');
}

function toLocalDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

module.exports = {
  toLocalDateKey
};
