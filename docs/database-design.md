# MediReturn Database Design

## Main Entities

MediReturn will initially contain these main entities:

- User
- Medicine
- Inventory
- Supplier
- Return
- Alert

## Entity Relationship

```text
                         USER
                          │
                          │ owns/manages
                          ▼
                       PHARMACY
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
          MEDICINE                  SUPPLIER
              │                       │
              │                       │
              └───────────┐   ┌───────┘
                          ▼   ▼
                       INVENTORY
                          │
             ┌────────────┼─────────────┐
             │            │             │
             ▼            ▼             ▼
           Batch       Quantity       Expiry
             │
             ├── Purchase Price
             │
             └── Return Window
                          │
                          ▼
                        RETURN
                          │
                          ▼
                        ALERT