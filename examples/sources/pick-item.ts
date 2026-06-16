// Plumbing node: take element [index] from a list (negative counts from the
// end), optionally drilling into a named field — so upstream blocks don't
// need single-purpose outputs like "firstId".
function generate(
  list: any[],
  index: NumberField<{ min: 0; default: 0 }>,
  fieldName: string,
): {
  item: any;
} {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) throw new Error('Pick: the list is empty');
  const i = index < 0 ? items.length + index : index;
  if (i < 0 || i >= items.length) {
    throw new Error('Pick: index ' + index + ' out of range (0..' + (items.length - 1) + ')');
  }
  const item = items[i];
  if (fieldName) {
    if (item === null || typeof item !== 'object' || !(fieldName in item)) {
      throw new Error('Pick: item has no field "' + fieldName + '"');
    }
    return { item: item[fieldName] };
  }
  return { item };
}
