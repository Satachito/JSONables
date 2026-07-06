# JSONables

## Overview

**JSONable** is an object that can be represented as JSON.

**JSONables** is a data management system intended to use clusters of JSONables like a database.

## Philosophy

Everything is a JSONable.

A record is a JSONable.
Metadata is a JSONable.
A configuration value is a JSONable.

JSONables is a collection of JSONable objects.

There are no special objects for records, metadata, or configuration.
Everything is represented as a JSONable and accessed through the same interface.

JSONables does not require a tabular schema.

A cluster may contain any collection of JSONables.

## JSONable

A JSONable is any value that can be represented by JSON.

- String
- Numeric
- Boolean
- Array
- Object
- Null

## JSONables

JSONables is a mechanism for handling clusters of JSONables.

## Purpose

- Manage JSONables by unique keys
- Provide CRUD operations for JSONables
- Store JSONables in memory, files, disks, or other storage areas
- Provide metadata as JSONables
- Keep the data format simple, portable, and human-readable

## Key

Each JSONable is identified by an internal generated id.

Generated ids are strings.

- `id`: JSONables internal generated ID. CRUD operations use this ID.
- `keyFields`: logical key for legacy, JV, and SQL compatibility. It is used for
  lookup, duplicate checks, and import collapse.

Domain keys may still be described in metadata for lookup, import, or compatibility,
but CRUD identity is independent of the JSONable's fields.

## Interface

### CRUD

POST /

GET /id

PUT /id

DELETE /id

### Metadata

GET /meta

GET /meta/recordCount

Additional metadata may be provided by an implementation.

## Example Implementation Styles

The following are examples of possible implementation styles.

### Example 1: Legacy DB Style JSONable

Records are arrays of primitive JSON values.

GET /1001

```json
["Satoru", 67, true]
```

GET /meta/fields

```json
["name", "age", "active"]
```

GET /meta/types

```json
["String", "Numeric", "Boolean"]
```

GET /meta/recordCount

```json
2
```

### Example 2: Full JSON Style JSONable

Records may contain arbitrary JSON structures.

There is no requirement that records share the same fields or schema.

GET /1001

```json
{
  "name": "Satoru",
  "age": 67
}
```

GET /1002

```json
{
  "city": "Tokyo",
  "temperature": 32.5
}
```

GET /meta/recordCount

```json
2
```

## Storage

Storage is implementation-dependent.

Possible storage styles include:

- Memory
- Local files
- Directories
- One JSONable per file
- JSON Lines (JSONL)
- Remote storage

## Concept

JSONables is not necessarily a replacement for relational databases.

It is a lightweight data management layer for JSONables.

The core ideas are:

- Readable as JSON
- Writable as JSON
- Addressable by key
- Usable like a database
- Metadata is JSONable
- No mandatory schema
- No mandatory storage format

## Possible Use Cases

- Local application data
- Configuration management
- Static sites
- SPA data storage
- Git-friendly storage
- Human-readable databases
- Prototyping
- Lightweight document stores
