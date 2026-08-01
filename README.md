# JSONables

> **Everything is a JSONable.**

JSONables is a lightweight data management model for managing collections (clusters) of JSONable objects through a common interface.

## Why JSONables?

Many applications do not need a full relational database.

They need:

- JSON-native data
- CRUD by key
- Human-readable storage
- Git-friendly files
- Minimal dependencies
- Freedom from rigid schemas

JSONables provides a common interface for managing JSONable objects without requiring a relational schema.

## Core Principles

1. Everything is a JSONable
2. Metadata is a JSONable
3. CRUD by key
4. Identity is managed by the cluster
5. No mandatory schema
6. No mandatory storage format

## What is a JSONable?

A JSONable is any value representable as JSON:

- String
- Numeric
- Boolean
- Array
- Object
- Null

## What is JSONables?

JSONables is a collection (cluster) of JSONable objects.

```text
Cluster
 ├─ 1001 → JSONable
 ├─ 1002 → JSONable
 └─ meta → JSONable
```

A cluster may contain any collection of JSONables.

There is no requirement that JSONables share the same structure.

## Identity

Every JSONable is identified by an internal key.

The internal key is generated and managed by the implementation.

JSONables does not require application data to contain a primary key field.

```json
{
  "name": "example-project",
  "active": true
}
```

is a valid JSONable.

Applications are not required to duplicate identity information inside the JSONable.

Unlike relational databases, JSONables does not assume that records contain a primary key column.

> Identity belongs to the cluster, not the JSONable.

## Internal IDs and Logical Keys

JSONables distinguishes between two different concepts:

### Internal ID

An Internal ID is the true identity of a JSONable.

- Generated and managed by the cluster
- Used for CRUD operations
- Never reused after deletion
- Not required to appear inside the JSONable itself

Example:

```text
1001 -> {
  "name": "example-project",
  "active": true
}
```

CRUD operations always use the Internal ID:

```text
GET /1001
PUT /1001
DELETE /1001
```

### Logical Key

A Logical Key is optional metadata used for:

- Lookup
- Duplicate detection
- Import compatibility
- Migration from legacy databases

Examples:

```text
raceId
horseId
email
username
```

Logical Keys are not identities.

Multiple Logical Keys may exist for a JSONable, and implementations may choose whether or not to enforce uniqueness.

### Design Principle

CRUD operations are performed using Internal IDs managed by the cluster.

Logical Keys are compatibility and lookup mechanisms, not identity mechanisms.

## Interface

CRUD operations:

```text
POST /key
GET /key
PUT /key
DELETE /key
```

Metadata:

```text
GET /meta
GET /meta/recordCount
```

Implementations may expose additional metadata.

## Quick Example

```text
POST /users
```

```json
{
  "name": "example-project",
  "active": true
}
```

Implementation assigns:

```text
1001
```

```text
GET /users/1001
```

```json
{
  "name": "example-project",
  "active": true
}
```

## Example Implementation Styles

JSONables defines an interface.

It does not define a storage engine.

The following are examples only.

### Legacy DB Style

Useful when compatibility with traditional databases is desired.

```json
["example-project", true]
```

```json
["name", "active"]
```

```json
["String", "Boolean"]
```

### Full JSON Style

Useful when records may have completely different structures.

```json
{
  "name": "example-project",
  "active": true
}
```

```json
{
  "city": "Tokyo",
  "temperature": 32.5
}
```

## Storage

Storage is implementation-dependent.

Possible implementations:

- Memory
- Local files
- Directories
- One JSONable per file
- JSONL
- Git repositories
- Object storage
- Remote services

JSONables intentionally does not standardize storage.

## Non Goals

JSONables is not intended to:

- Replace relational databases
- Require primary key fields
- Define a storage engine
- Enforce schemas

## Possible Use Cases

- Local application data
- Configuration management
- Static websites
- SPA applications
- Git-friendly storage
- Lightweight document stores
- Prototyping
- Embedded applications

## Tagline

**Everything is a JSONable.**
