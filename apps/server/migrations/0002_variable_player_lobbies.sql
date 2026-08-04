UPDATE games
SET settings_json = json_set(
  json_remove(settings_json, '$.seatCount'),
  '$.playerCapacity',
  6
)
WHERE json_type(settings_json, '$.playerCapacity') IS NULL;
