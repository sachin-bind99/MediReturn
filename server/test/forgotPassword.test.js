import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { forgotPassword } from "../controllers/authController.js";
import User from "../models/User.js";

const environmentKeys = [
    "APPS_SCRIPT_URL",
    "MEDIRETURN_MAIL_SECRET",
    "FRONTEND_URL",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "NODE_ENV",
];

function applyTestEnvironment(values = {}) {
    for (const key of environmentKeys) {
        if (Object.hasOwn(values, key)) {
            process.env[key] = values[key];
        } else {
            delete process.env[key];
        }
    }
}

function setTestEnvironment(t, values = {}) {
    const previousValues = new Map(
        environmentKeys.map((key) => [key, process.env[key]])
    );
    applyTestEnvironment(values);

    t.after(() => {
        for (const [key, value] of previousValues) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });
}

function createResponse() {
    return {
        statusCode: undefined,
        body: undefined,
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

function mockUserLookup(
    t,
    { email = "reset-user@example.test", userExists = true } = {}
) {
    const saves = [];
    const user = userExists
        ? {
              email,
              password: "existing-password-hash",
              authProvider: "local",
              passwordResetTokenHash: undefined,
              passwordResetExpires: undefined,
              async save() {
                  saves.push({
                      hash: this.passwordResetTokenHash,
                      expires: this.passwordResetExpires,
                  });
              },
          }
        : null;

    let lookupCount = 0;
    t.mock.method(User, "findOne", () => {
        lookupCount += 1;
        return { select: async () => user };
    });

    return {
        user,
        saves,
        get lookupCount() {
            return lookupCount;
        },
    };
}

function mockEmailService(t, implementation) {
    return t.mock.method(globalThis, "fetch", implementation);
}

function successfulServiceResponse() {
    return {
        ok: true,
        status: 200,
        async json() {
            return { ok: true };
        },
    };
}

function validEnvironment(overrides = {}) {
    return {
        APPS_SCRIPT_URL:
            "https://script.google.com/macros/s/test-deployment/exec",
        MEDIRETURN_MAIL_SECRET: "test-only-mail-secret",
        FRONTEND_URL: "https://medi-return-smoky.vercel.app",
        ...overrides,
    };
}

function assertGenericSuccess(response) {
    assert.equal(response.statusCode, 200);
    assert.equal(
        response.body.message,
        "If an eligible account exists for this email, a password reset link will be sent."
    );
}

async function requestReset(response = createResponse()) {
    await forgotPassword(
        { body: { email: "RESET-USER@example.test" } },
        response
    );
    return response;
}

test("forgotPassword sends the Apps Script JSON contract and stores only a hash", async (t) => {
    setTestEnvironment(t, validEnvironment({
        // Trailing slashes are normalized so the reset URL matches the script property.
        FRONTEND_URL: "https://medi-return-smoky.vercel.app///",
        NODE_ENV: "production",
    }));

    const { user, saves } = mockUserLookup(t);
    let sentUrl;
    let requestOptions;
    mockEmailService(t, async (url, options) => {
        sentUrl = url;
        requestOptions = options;
        return successfulServiceResponse();
    });

    const response = await requestReset();

    assertGenericSuccess(response);
    assert.equal(
        sentUrl.toString(),
        "https://script.google.com/macros/s/test-deployment/exec"
    );
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.headers["content-type"], "application/json");

    const sentPayload = JSON.parse(requestOptions.body);
    assert.deepEqual(Object.keys(sentPayload), ["secret", "to", "resetUrl"]);
    assert.equal(sentPayload.secret, "test-only-mail-secret");
    assert.equal(sentPayload.to, "reset-user@example.test");

    const parsedResetUrl = new URL(sentPayload.resetUrl);
    const resetToken = parsedResetUrl.searchParams.get("token");
    assert.ok(/^[a-f0-9]{64}$/.test(resetToken ?? ""));
    assert.equal(parsedResetUrl.origin, "https://medi-return-smoky.vercel.app");
    assert.equal(parsedResetUrl.pathname, "/reset-password");
    assert.equal(
        user.passwordResetTokenHash,
        createHash("sha256").update(resetToken).digest("hex")
    );
    assert.ok(!sentPayload.resetUrl.includes("///reset-password"));
    assert.ok(user.passwordResetExpires instanceof Date);
    const expiryMsRemaining = user.passwordResetExpires.getTime() - Date.now();
    assert.ok(expiryMsRemaining > 14 * 60 * 1000);
    assert.ok(expiryMsRemaining <= 15 * 60 * 1000);
    assert.equal(saves.length, 1);
});

test("forgotPassword does not require Resend configuration", async (t) => {
    setTestEnvironment(t, validEnvironment());
    mockUserLookup(t);
    mockEmailService(t, async () => successfulServiceResponse());

    const response = await requestReset();

    assertGenericSuccess(response);
});

test(
    "forgotPassword keeps missing or invalid service configuration out of account lookup",
    async (t) => {
        setTestEnvironment(t);
        t.mock.method(console, "error", () => {});
        let lookupCount = 0;
        t.mock.method(User, "findOne", () => {
            lookupCount += 1;
            throw new Error("User lookup should not run with invalid configuration");
        });

        const cases = [
            {
                name: "Apps Script URL",
                values: {
                    MEDIRETURN_MAIL_SECRET: "secret",
                    FRONTEND_URL: "https://frontend.test",
                },
            },
            {
                name: "mail secret",
                values: {
                    APPS_SCRIPT_URL: "https://script.test/macros/s/deploy/exec",
                    FRONTEND_URL: "https://frontend.test",
                },
            },
            {
                name: "frontend URL",
                values: {
                    APPS_SCRIPT_URL: "https://script.test/macros/s/deploy/exec",
                    MEDIRETURN_MAIL_SECRET: "secret",
                },
            },
            {
                name: "invalid Apps Script URL",
                values: validEnvironment({
                    APPS_SCRIPT_URL: "ftp://script.test/macros/s/deploy/exec",
                }),
            },
            {
                name: "URL without /exec",
                values: validEnvironment({
                    APPS_SCRIPT_URL: "https://script.test/macros/s/deploy",
                }),
            },
            {
                name: "invalid frontend URL",
                values: validEnvironment({ FRONTEND_URL: "ftp://frontend.test" }),
            },
        ];

        for (const configurationCase of cases) {
            applyTestEnvironment(configurationCase.values);
            const response = await requestReset();
            assert.equal(response.statusCode, 503, configurationCase.name);
            assert.equal(
                response.body.message,
                "Password reset email service is not configured",
                configurationCase.name
            );
        }

        assert.equal(lookupCount, 0);
    }
);

async function assertEmailFailure(t, fetchImplementation) {
    setTestEnvironment(t, validEnvironment());
    const { user, saves } = mockUserLookup(t);
    const errorLogs = [];
    t.mock.method(console, "error", (...args) => errorLogs.push(args));
    let requestOptions;
    mockEmailService(t, async (url, options) => {
        requestOptions = options;
        return fetchImplementation(url, options);
    });

    const response = await requestReset();

    assertGenericSuccess(response);
    assert.equal(saves.length, 2);
    assert.equal(user.passwordResetTokenHash, undefined);
    assert.equal(user.passwordResetExpires, undefined);

    const resetUrl = JSON.parse(requestOptions.body).resetUrl;
    const valuesThatMustNotBeLogged = [
        "test-only-mail-secret",
        new URL(resetUrl).searchParams.get("token"),
        resetUrl,
    ];
    const logs = JSON.stringify(errorLogs);
    for (const sensitiveValue of valuesThatMustNotBeLogged) {
        assert.ok(!logs.includes(sensitiveValue), "sensitive values are not logged");
    }
}

test("forgotPassword clears the unused token when Apps Script rejects the request", async (t) => {
    await assertEmailFailure(t, async () => ({
        ok: true,
        status: 200,
        async json() {
            return { ok: false };
        },
    }));
});

test("forgotPassword requires an HTTP success even when the response body says ok", async (t) => {
    await assertEmailFailure(t, async () => ({
        ok: false,
        status: 503,
        async json() {
            return { ok: true };
        },
    }));
});

test("forgotPassword clears the unused token for invalid JSON responses", async (t) => {
    await assertEmailFailure(t, async () => ({
        ok: true,
        status: 200,
        async json() {
            throw new SyntaxError("Invalid JSON");
        },
    }));
});

test(
    "forgotPassword clears the unused token after network errors without logging details",
    async (t) => {
        await assertEmailFailure(t, async (_url, options) => {
            throw new TypeError(`Network error while sending ${options.body}`);
        });
    }
);

test("forgotPassword uses a timeout and clears the unused token when it expires", async (t) => {
    setTestEnvironment(t, validEnvironment());
    const { user, saves } = mockUserLookup(t);
    const errorLogs = [];
    t.mock.method(console, "error", (...args) => errorLogs.push(args));
    t.mock.timers.enable({ apis: ["setTimeout"] });

    let signal;
    let signalReceived;
    const fetchStarted = new Promise((resolve) => {
        signalReceived = resolve;
    });
    mockEmailService(t, async (_url, options) => {
        signal = options.signal;
        return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
            });
            signalReceived();
        });
    });

    const pendingResponse = requestReset();
    await fetchStarted;
    assert.equal(signal.aborted, false);
    t.mock.timers.tick(10 * 1000);
    const response = await pendingResponse;

    assertGenericSuccess(response);
    assert.equal(signal.aborted, true);
    assert.equal(saves.length, 2);
    assert.equal(user.passwordResetTokenHash, undefined);
    assert.equal(user.passwordResetExpires, undefined);
    assert.equal(JSON.stringify(errorLogs).includes("TimeoutError"), false);
});

test(
    "forgotPassword responds generically without contacting email service for unknown accounts",
    async (t) => {
        setTestEnvironment(t, validEnvironment());
        mockUserLookup(t, { userExists: false });
        let sendCount = 0;
        mockEmailService(t, async () => {
            sendCount += 1;
            return successfulServiceResponse();
        });

        const response = await requestReset();

        assertGenericSuccess(response);
        assert.equal(sendCount, 0);
    }
);
