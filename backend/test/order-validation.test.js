import test from "node:test";
import assert from "node:assert/strict";
import { missingDeliveryAddressFields } from "../src/order-validation.js";

const validAddress = {
  postalCode: "49000-000",
  state: "SE",
  city: "São Cristóvão",
  neighborhood: "Centro",
  street: "Rua Principal",
  addressNumber: "10",
};

test("delivery complement is optional", () => {
  assert.deepEqual(missingDeliveryAddressFields(validAddress), []);
  assert.deepEqual(
    missingDeliveryAddressFields({ ...validAddress, complement: "" }),
    [],
  );
});

test("delivery validation reports only required address fields", () => {
  assert.deepEqual(
    missingDeliveryAddressFields({
      ...validAddress,
      postalCode: "",
      city: " ",
    }),
    ["CEP", "cidade"],
  );
});
