# cf-storage-adapter

```json:wrangler.jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "DOKVS",
        "class_name": "DOKVS"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": [
        "DOKVS"
      ]
    }
  ]
}
```
