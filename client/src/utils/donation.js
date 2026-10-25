export const categoryOptions = [
  'prepared-meals',
  'produce',
  'bakery',
  'dairy',
  'packaged',
  'other',
];
export const unitOptions = [
  'servings',
  'items',
  'packs',
  'kg',
  'grams',
  'litres',
  'millilitres',
];
export const readable = (value) =>
  value.replaceAll('_', ' ').replaceAll('-', ' ');
export const formatTime = (value) =>
  new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
