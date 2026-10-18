# MediReturn Database Design

## Implemented models

### User

Stores a pharmacist account with a unique, normalized email address and a
bcrypt-hashed password.

### Medicine

Stores a medicine catalog entry with its name, generic name, manufacturer,
category, barcode, and optional description. Each entry belongs to the user who
created it. Barcodes are unique within that user's catalog.

```text
USER 1 ---- many MEDICINE
```

## Planned models

Inventory, Supplier, Return, and Alert are not implemented yet. The intended
inventory model will connect a medicine to stock batches, quantities, expiry
dates, purchase prices, and return windows. Return records and alerts can then
refer to the affected inventory batches.
