import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const testDbUri = process.env.MONGODB_TEST_URI;
const testDbName = process.env.MONGODB_TEST_DB_NAME;
const integrationSkipReason = !testDbUri
    ? "Set MONGODB_TEST_URI to a dedicated test MongoDB deployment"
    : !testDbName || !/_test$/i.test(testDbName) || testDbName.toLowerCase() === "medireturn"
        ? "Set MONGODB_TEST_DB_NAME to a dedicated database name ending in _test"
        : false;

test(
    "MediReturn multi-owner authorization and session integration",
    { skip: integrationSkipReason },
    async (t) => {
        process.env.NODE_ENV = "test";
        process.env.JWT_SECRET = randomBytes(48).toString("hex");

        const mongoose = (await import("mongoose")).default;
        const connectDB = (await import("../config/db.js")).default;
        const app = (await import("../app.js")).default;
        const User = (await import("../models/User.js")).default;
        const Session = (await import("../models/Session.js")).default;
        const Medicine = (await import("../models/Medicine.js")).default;
        const Supplier = (await import("../models/Supplier.js")).default;
        const Inventory = (await import("../models/Inventory.js")).default;
        const Return = (await import("../models/Return.js")).default;
        const Alert = (await import("../models/Alert.js")).default;
        const InventoryActivity = (
            await import("../models/InventoryActivity.js")
        ).default;

        await connectDB();
        const hello = await mongoose.connection.db.admin().command({ hello: 1 });
        if (!hello.setName && hello.msg !== "isdbgrid") {
            await mongoose.disconnect();
            t.skip("Return status tests require a transaction-capable MongoDB replica set");
            return;
        }

        const server = app.listen(0, "127.0.0.1");
        await new Promise((resolve, reject) => {
            server.once("listening", resolve);
            server.once("error", reject);
        });

        const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
        const password = "MediReturn-Test-Password-1";
        const resetPassword = "MediReturn-Test-Password-2";
        const suffix = randomUUID();
        const userIds = [];

        const callApi = async (path, { token, method = "GET", body } = {}) => {
            const headers = {};
            if (token) headers.Authorization = `Bearer ${token}`;
            if (body !== undefined) headers["Content-Type"] = "application/json";

            const response = await fetch(`${baseUrl}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body)
            });
            const data = await response.json().catch(() => ({}));
            return { response, data };
        };

        const login = async (email, suppliedPassword = password) => {
            const { response, data } = await callApi("/auth/login", {
                method: "POST",
                body: { email, password: suppliedPassword }
            });
            return { response, data };
        };

        try {
            const passwordHash = await bcrypt.hash(password, 4);
            const [ownerA, ownerB, staffA, staffB] = await User.create([
                {
                    name: "Owner A Test",
                    email: `owner-a-${suffix}@example.test`,
                    password: passwordHash,
                    role: "PHARMACIST",
                    authProvider: "local"
                },
                {
                    name: "Owner B Test",
                    email: `owner-b-${suffix}@example.test`,
                    password: passwordHash,
                    role: "PHARMACIST",
                    authProvider: "local"
                },
                {
                    name: "Staff A Test",
                    email: `staff-a-${suffix}@example.test`,
                    password: passwordHash,
                    role: "STAFF",
                    authProvider: "local"
                },
                {
                    name: "Staff B Test",
                    email: `staff-b-${suffix}@example.test`,
                    password: passwordHash,
                    role: "STAFF",
                    authProvider: "local"
                }
            ]);
            userIds.push(ownerA._id, ownerB._id, staffA._id, staffB._id);

            const [medicineA, medicineB] = await Medicine.create([
                {
                    name: "Owner A Medicine",
                    genericName: "Example A",
                    manufacturer: "Test Labs A",
                    category: "Tablet",
                    barcode: `90000000000${suffix.slice(0, 2)}`,
                    createdBy: ownerA._id
                },
                {
                    name: "Owner B Medicine",
                    genericName: "Example B",
                    manufacturer: "Test Labs B",
                    category: "Tablet",
                    barcode: `91000000000${suffix.slice(0, 2)}`,
                    createdBy: ownerB._id
                }
            ]);
            const medicineStaffA = await Medicine.create({
                name: "Staff A Medicine",
                genericName: "Staff Example",
                manufacturer: "Staff Test Labs",
                category: "Tablet",
                barcode: `92000000000${suffix.slice(0, 2)}`,
                createdBy: staffA._id
            });

            const [supplierA, supplierB] = await Supplier.create([
                {
                    name: "Supplier A",
                    companyName: "Supplier Company A",
                    phone: "1000000001",
                    email: `supplier-a-${suffix}@example.test`,
                    address: "Test Address A",
                    returnPolicy: "Test return policy",
                    createdBy: ownerA._id
                },
                {
                    name: "Supplier B",
                    companyName: "Supplier Company B",
                    phone: "1000000002",
                    email: `supplier-b-${suffix}@example.test`,
                    address: "Test Address B",
                    returnPolicy: "Test return policy",
                    createdBy: ownerB._id
                }
            ]);
            const supplierStaffA = await Supplier.create({
                name: "Staff A Supplier",
                companyName: "Staff Supplier Company",
                phone: "1000000003",
                email: `staff-supplier-${suffix}@example.test`,
                address: "Staff Test Address",
                returnPolicy: "Test return policy",
                createdBy: staffA._id
            });

            const [inventoryA, inventoryB] = await Inventory.create([
                {
                    medicine: medicineA._id,
                    supplier: supplierA._id,
                    batchNumber: `A-${suffix}`,
                    quantity: 10,
                    purchasePrice: 12,
                    expiryDate: new Date(Date.now() + 3 * 86400000),
                    returnWindowDays: 10,
                    location: "Test shelf A",
                    createdBy: ownerA._id
                },
                {
                    medicine: medicineB._id,
                    supplier: supplierB._id,
                    batchNumber: `B-${suffix}`,
                    quantity: 7,
                    purchasePrice: 18,
                    expiryDate: new Date(Date.now() + 3 * 86400000),
                    returnWindowDays: 10,
                    location: "Test shelf B",
                    createdBy: ownerB._id
                }
            ]);
            const inventoryStaffA = await Inventory.create({
                medicine: medicineStaffA._id,
                supplier: supplierStaffA._id,
                batchNumber: `STAFF-${suffix}`,
                quantity: 5,
                purchasePrice: 9,
                expiryDate: new Date(Date.now() + 3 * 86400000),
                returnWindowDays: 10,
                location: "Staff test shelf",
                createdBy: staffA._id
            });

            const [returnA, protectedReturnA, returnB, returnStaffA] = await Return.create([
                {
                    inventory: inventoryA._id,
                    medicine: medicineA._id,
                    supplier: supplierA._id,
                    batchNumber: inventoryA.batchNumber,
                    quantity: 2,
                    returnValue: 24,
                    reason: "Authorized test return",
                    status: "PENDING",
                    requestedBy: ownerA._id,
                    createdBy: ownerA._id
                },
                {
                    inventory: inventoryA._id,
                    medicine: medicineA._id,
                    supplier: supplierA._id,
                    batchNumber: inventoryA.batchNumber,
                    quantity: 1,
                    returnValue: 12,
                    reason: "Cross-owner protection test",
                    status: "APPROVED",
                    requestedBy: ownerA._id,
                    createdBy: ownerA._id
                },
                {
                    inventory: inventoryB._id,
                    medicine: medicineB._id,
                    supplier: supplierB._id,
                    batchNumber: inventoryB.batchNumber,
                    quantity: 1,
                    returnValue: 18,
                    reason: "Owner B test return",
                    status: "PENDING",
                    requestedBy: ownerB._id,
                    createdBy: ownerB._id
                },
                {
                    inventory: inventoryStaffA._id,
                    medicine: medicineStaffA._id,
                    supplier: supplierStaffA._id,
                    batchNumber: inventoryStaffA.batchNumber,
                    quantity: 2,
                    returnValue: 18,
                    reason: "Staff A workspace return",
                    status: "PENDING",
                    requestedBy: staffA._id,
                    createdBy: staffA._id
                }
            ]);

            const [alertA, alertB] = await Alert.create([
                {
                    inventory: inventoryA._id,
                    user: ownerA._id,
                    type: "EXPIRING_SOON",
                    title: "Owner A test alert",
                    message: "Owner A test alert message",
                    priority: "HIGH"
                },
                {
                    inventory: inventoryB._id,
                    user: ownerB._id,
                    type: "EXPIRING_SOON",
                    title: "Owner B test alert",
                    message: "Owner B test alert message",
                    priority: "HIGH"
                }
            ]);

            const sessions = {};
            for (const user of [ownerA, ownerB, staffA, staffB]) {
                const result = await login(user.email);
                assert.equal(result.response.status, 200);
                sessions[user.email] = result.data.token;
            }
            await t.test("each account reads only its own resources", async () => {
                const resources = [
                    ["/medicines", medicineA._id, medicineB._id],
                    ["/suppliers", supplierA._id, supplierB._id],
                    ["/inventory", inventoryA._id, inventoryB._id],
                    ["/dashboard", inventoryA._id, inventoryB._id],
                    ["/alerts", alertA._id, alertB._id],
                    ["/returns", returnA._id, returnB._id]
                ];

                for (const [path, ownId, foreignId] of resources) {
                    const { response, data } = await callApi(path, {
                        token: sessions[ownerA.email]
                    });
                    const serialized = JSON.stringify(data);
                    assert.equal(response.status, 200, path);
                    assert.ok(serialized.includes(String(ownId)), path);
                    assert.ok(!serialized.includes(String(foreignId)), path);
                }
            });

            await t.test("foreign return IDs are denied for owners and staff", async () => {
                const ownerRead = await callApi(`/returns/${returnA._id}`, {
                    token: sessions[ownerB.email]
                });
                assert.equal(ownerRead.response.status, 404);

                const staffRead = await callApi(`/returns/${returnA._id}`, {
                    token: sessions[staffB.email]
                });
                assert.equal(staffRead.response.status, 404);

                const pharmacistUpdate = await callApi(
                    `/returns/${returnA._id}/status`,
                    {
                        token: sessions[ownerB.email],
                        method: "PATCH",
                        body: { status: "APPROVED" }
                    }
                );
                assert.equal(pharmacistUpdate.response.status, 403);

                const staffUpdate = await callApi(
                    `/returns/${protectedReturnA._id}/status`,
                    {
                        token: sessions[staffB.email],
                        method: "PATCH",
                        body: {
                            status: "RETURNED",
                            createdBy: String(ownerB._id),
                            requestedBy: String(ownerB._id)
                        }
                    }
                );
                assert.equal(staffUpdate.response.status, 404);
            });

            await t.test("foreign medicine, supplier, and inventory IDs cannot be read, updated, or deleted", async () => {
                const attempts = [
                    ["/medicines", medicineA._id, { name: "Tampered" }],
                    ["/suppliers", supplierA._id, { name: "Tampered" }],
                    ["/inventory", inventoryA._id, { quantity: 1 }]
                ];

                for (const [resource, id, body] of attempts) {
                    const detail = await callApi(`${resource}/${id}`, {
                        token: sessions[ownerB.email]
                    });
                    assert.equal(detail.response.status, 404, resource);

                    const update = await callApi(`${resource}/${id}`, {
                        token: sessions[ownerB.email],
                        method: "PUT",
                        body: { ...body, createdBy: String(ownerB._id) }
                    });
                    assert.ok([403, 404].includes(update.response.status), resource);

                    const remove = await callApi(`${resource}/${id}`, {
                        token: sessions[ownerB.email],
                        method: "DELETE"
                    });
                    assert.ok([403, 404].includes(remove.response.status), resource);
                }
            });

            await t.test("staff can process returns in their own workspace only", async () => {
                const staffAList = await callApi("/returns", {
                    token: sessions[staffA.email]
                });
                const staffBList = await callApi("/returns", {
                    token: sessions[staffB.email]
                });
                assert.equal(staffAList.response.status, 200);
                assert.equal(staffBList.response.status, 200);
                assert.ok(JSON.stringify(staffAList.data).includes(String(returnStaffA._id)));
                assert.ok(!JSON.stringify(staffBList.data).includes(String(returnA._id)));

                const approve = await callApi(`/returns/${returnStaffA._id}/status`, {
                    token: sessions[staffA.email],
                    method: "PATCH",
                    body: { status: "APPROVED" }
                });
                assert.equal(approve.response.status, 200);

                const process = await callApi(`/returns/${returnStaffA._id}/status`, {
                    token: sessions[staffA.email],
                    method: "PATCH",
                    body: { status: "RETURNED" }
                });
                assert.equal(process.response.status, 200);

                const inventoryAfterProcess = await Inventory.findById(inventoryStaffA._id);
                assert.equal(inventoryAfterProcess.quantity, 3);

                const foreignProcess = await callApi(
                    `/returns/${protectedReturnA._id}/status`,
                    {
                        token: sessions[staffB.email],
                        method: "PATCH",
                        body: { status: "RETURNED" }
                    }
                );
                assert.equal(foreignProcess.response.status, 404);
                const inventoryAfterForeignAttempt = await Inventory.findById(inventoryA._id);
                assert.equal(inventoryAfterForeignAttempt.quantity, 10);
            });

            await t.test("request body ownership fields cannot cross-link resources", async () => {
                const inventoryAttempt = await callApi("/inventory", {
                    token: sessions[ownerB.email],
                    method: "POST",
                    body: {
                        medicine: String(medicineA._id),
                        supplier: String(supplierA._id),
                        batchNumber: `FOREIGN-${suffix}`,
                        quantity: 2,
                        purchasePrice: 1,
                        expiryDate: new Date(Date.now() + 86400000).toISOString(),
                        returnWindowDays: 5,
                        location: "Test",
                        createdBy: String(ownerA._id),
                        userId: String(ownerA._id),
                        shopId: String(ownerA._id)
                    }
                });
                assert.equal(inventoryAttempt.response.status, 404);

                const returnAttempt = await callApi("/returns", {
                    token: sessions[ownerB.email],
                    method: "POST",
                    body: {
                        inventory: String(inventoryA._id),
                        quantity: 1,
                        reason: "Foreign inventory test",
                        createdBy: String(ownerA._id),
                        requestedBy: String(ownerA._id),
                        userId: String(ownerA._id),
                        shopId: String(ownerA._id)
                    }
                });
                assert.equal(returnAttempt.response.status, 404);
            });

            await t.test("authorized return creation ignores client ownership fields", async () => {
                const result = await callApi("/returns", {
                    token: sessions[ownerA.email],
                    method: "POST",
                    body: {
                        inventory: String(inventoryA._id),
                        quantity: 1,
                        reason: "Authorized creation test",
                        createdBy: String(ownerB._id),
                        requestedBy: String(ownerB._id),
                        userId: String(ownerB._id),
                        shopId: String(ownerB._id)
                    }
                });
                assert.equal(result.response.status, 201);
                const stored = await Return.findById(result.data.return._id)
                    .select("+createdBy");
                assert.equal(String(stored.createdBy), String(ownerA._id));
                assert.equal(String(stored.requestedBy), String(ownerA._id));
            });

            await t.test("authorized medicine, supplier, and inventory creation still works", async () => {
                const barcode = `93${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 100)}`;
                const medicineResult = await callApi("/medicines", {
                    token: sessions[ownerB.email],
                    method: "POST",
                    body: {
                        name: "Owner B Created Medicine",
                        genericName: "Created Example",
                        manufacturer: "Test Labs",
                        category: "Capsule",
                        barcode,
                        createdBy: String(ownerA._id)
                    }
                });
                assert.equal(medicineResult.response.status, 201);
                const createdMedicine = await Medicine.findById(
                    medicineResult.data.medicine._id
                );
                assert.equal(String(createdMedicine.createdBy), String(ownerB._id));

                const supplierResult = await callApi("/suppliers", {
                    token: sessions[ownerB.email],
                    method: "POST",
                    body: {
                        name: "Owner B Created Supplier",
                        companyName: "Created Supplier Co",
                        phone: String(2000000000 + Math.floor(Math.random() * 7000000000)),
                        email: `created-${suffix}@example.test`,
                        address: "Test Address",
                        returnPolicy: "Test policy",
                        createdBy: String(ownerA._id)
                    }
                });
                assert.equal(supplierResult.response.status, 201);
                const createdSupplier = await Supplier.findById(
                    supplierResult.data.supplier._id
                );
                assert.equal(String(createdSupplier.createdBy), String(ownerB._id));

                const inventoryResult = await callApi("/inventory", {
                    token: sessions[ownerB.email],
                    method: "POST",
                    body: {
                        medicine: String(createdMedicine._id),
                        supplier: String(createdSupplier._id),
                        batchNumber: `CREATED-${suffix}`,
                        quantity: 4,
                        purchasePrice: 7,
                        expiryDate: new Date(Date.now() + 30 * 86400000).toISOString(),
                        returnWindowDays: 10,
                        location: "Owner B test shelf",
                        createdBy: String(ownerA._id)
                    }
                });
                assert.equal(inventoryResult.response.status, 201);
                const createdInventory = await Inventory.findById(
                    inventoryResult.data.inventory._id
                );
                assert.equal(String(createdInventory.createdBy), String(ownerB._id));
                assert.equal(String(createdInventory.medicine), String(createdMedicine._id));
                assert.equal(String(createdInventory.supplier), String(createdSupplier._id));
            });

            await t.test("missing, invalid, expired, and logged-out tokens fail", async () => {
                const missing = await callApi("/returns");
                assert.equal(missing.response.status, 401);

                const invalid = await callApi("/returns", { token: "invalid-token" });
                assert.equal(invalid.response.status, 401);

                const expired = jwt.sign(
                    {
                        userId: String(ownerA._id),
                        tokenVersion: 0
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: "-1s", jwtid: randomBytes(32).toString("hex") }
                );
                const expiredResponse = await callApi("/returns", { token: expired });
                assert.equal(expiredResponse.response.status, 401);

                const ownerBToken = sessions[ownerB.email];
                const logout = await callApi("/auth/logout", {
                    token: ownerBToken,
                    method: "POST"
                });
                assert.equal(logout.response.status, 200);
                const revoked = await callApi("/dashboard", { token: ownerBToken });
                assert.equal(revoked.response.status, 401);

                const freshLogin = await login(ownerB.email);
                assert.equal(freshLogin.response.status, 200);
                const freshSession = await callApi("/dashboard", {
                    token: freshLogin.data.token
                });
                assert.equal(freshSession.response.status, 200);
            });

            await t.test("password reset revokes old tokens and allows a fresh login", async () => {
                const resetToken = randomBytes(32).toString("hex");
                await User.updateOne(
                    { _id: ownerA._id },
                    {
                        $set: {
                            passwordResetTokenHash: createHash("sha256")
                                .update(resetToken)
                                .digest("hex"),
                            passwordResetExpires: new Date(Date.now() + 60000)
                        }
                    }
                );

                const reset = await callApi("/auth/reset-password", {
                    method: "POST",
                    body: { token: resetToken, password: resetPassword }
                });
                assert.equal(reset.response.status, 200);

                const oldSession = await callApi("/dashboard", {
                    token: sessions[ownerA.email]
                });
                assert.equal(oldSession.response.status, 401);

                const oldPasswordLogin = await login(ownerA.email);
                assert.equal(oldPasswordLogin.response.status, 401);
                const newPasswordLogin = await login(ownerA.email, resetPassword);
                assert.equal(newPasswordLogin.response.status, 200);
                const newSession = await callApi("/dashboard", {
                    token: newPasswordLogin.data.token
                });
                assert.equal(newSession.response.status, 200);
            });
        } finally {
            if (userIds.length > 0) {
                const ids = userIds;
                await Return.deleteMany({
                    $or: [
                        { createdBy: { $in: ids } },
                        { requestedBy: { $in: ids } }
                    ]
                });
                await Alert.deleteMany({ user: { $in: ids } });
                await InventoryActivity.deleteMany({ performedBy: { $in: ids } });
                await Inventory.deleteMany({ createdBy: { $in: ids } });
                await Medicine.deleteMany({ createdBy: { $in: ids } });
                await Supplier.deleteMany({ createdBy: { $in: ids } });
                await Session.deleteMany({ user: { $in: ids } });
                await User.deleteMany({ _id: { $in: ids } });
            }
            await new Promise((resolve) => server.close(resolve));
            await mongoose.disconnect();
        }
    }
);
