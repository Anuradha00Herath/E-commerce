/**
 * Seeds the minimum data for a demo:
 *   - one test vendor (seller) with an emailpass login, approved and ready to sell
 *   - one product owned by that vendor, priced in LKR, with stock and an image
 *
 * Safe to re-run: if the vendor already exists, seeding is skipped entirely.
 *
 * Usage (from packages/api):
 *   npx medusa exec ./src/scripts/seed-demo-vendor.ts
 * or, via the workspace script:
 *   npm run seed:demo-vendor --workspace=@acme/api   (see package.json)
 */
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { ProductStatus } from "@mercurjs/types";
import {
  approveSellerWorkflow,
  createOffersWorkflow,
  createProductsWorkflow,
  createSellerAccountWorkflow,
  createSellerShippingOptionsWorkflow,
  createSellerStockLocationsWorkflow,
} from "@mercurjs/core/workflows";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createLocationFulfillmentSetWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createServiceZonesWorkflow,
  createShippingProfilesWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

// Small local workflow (same pattern Mercur's own seed.ts uses) to set the
// store's supported currencies, since there's no dedicated core-flow for it.
const updateStoreCurrencies = createWorkflow(
  "update-store-currencies-demo-vendor",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => ({
      selector: { id: data.input.store_id },
      update: {
        supported_currencies: data.input.supported_currencies.map((c) => ({
          currency_code: c.currency_code,
          is_default: c.is_default ?? false,
        })),
      },
    }));
    const stores = updateStoresStep(normalizedInput);
    return new WorkflowResponse(stores);
  }
);

const COUNTRY_CODE = "lk"; // Sri Lanka
const CURRENCY_CODE = "lkr";
const DEMO_PASSWORD = "DemoVendor123!"; // fixed so the seed stays repeatable

const VENDOR = {
  name: "Test Vendor Store",
  email: "vendor@marketplace.local",
  first_name: "Test",
  last_name: "Vendor",
  city: "Colombo",
  address_1: "No. 1, Galle Road",
};

const PRODUCT = {
  title: "Handwoven Ceylon Cotton Tote Bag",
  description:
    "A durable, handwoven cotton tote bag made by local artisans — roomy enough " +
    "for a day at the market, with reinforced stitching on the handles.",
  handle: "handwoven-ceylon-cotton-tote-bag",
  sku: "DEMO-VENDOR-TOTE-01",
  price: 3500, // LKR, major currency units (i.e. Rs. 3,500.00)
  stock: 25,
  // Placeholder image — deterministic per seed value, safe to re-run.
  image: "https://picsum.photos/seed/demo-vendor-tote-bag/800/800",
};

export default async function seedDemoVendor({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const authModuleService = container.resolve(Modules.AUTH);
  const storeModuleService = container.resolve(Modules.STORE);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const regionModuleService = container.resolve(Modules.REGION);
  const taxModuleService = container.resolve(Modules.TAX);

  // Idempotency: bail out early if this demo vendor already exists.
  const { data: existingSellers } = await query.graph({
    entity: "seller",
    fields: ["id"],
    filters: { email: VENDOR.email },
  });
  if (existingSellers[0]) {
    logger.info(
      `Demo vendor "${VENDOR.email}" already exists — skipping seed. ` +
        `(Delete the seller in the Admin Panel first if you want a clean re-seed.)`
    );
    return;
  }

  logger.info("Ensuring store, sales channel, region and tax setup...");

  let [store] = await storeModuleService.listStores();
  if (!store) {
    const { result: storeResult } = await createStoresWorkflow(container).run({
      input: { stores: [{ name: "Marketplace" }] },
    });
    store = storeResult[0];
  }

  let [defaultSalesChannel] = await salesChannelModuleService.listSalesChannels(
    { name: "Default Sales Channel" }
  );
  if (!defaultSalesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    });
    defaultSalesChannel = result[0];
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [{ currency_code: CURRENCY_CODE, is_default: true }],
    },
  });
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { default_sales_channel_id: defaultSalesChannel.id },
    },
  });

  const existingRegions = await regionModuleService.listRegions(
    {},
    { relations: ["countries"] }
  );
  let region = existingRegions.find((r) =>
    r.countries?.some((c) => c.iso_2 === COUNTRY_CODE)
  );
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Sri Lanka",
            currency_code: CURRENCY_CODE,
            countries: [COUNTRY_CODE],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = result[0];
  }

  const existingTaxRegions = await taxModuleService.listTaxRegions({
    country_code: COUNTRY_CODE,
  });
  if (!existingTaxRegions.length) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: COUNTRY_CODE, provider_id: "tp_system" }],
    });
  }

  const { data: existingApiKeys } = await query.graph({
    entity: "api_key",
    fields: ["id"],
    filters: { type: "publishable" },
  });
  let publishableApiKey = existingApiKeys[0];
  if (!publishableApiKey) {
    const {
      result: [created],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [{ title: "Storefront", type: "publishable", created_by: "" }],
      },
    });
    publishableApiKey = created;
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: publishableApiKey.id, add: [defaultSalesChannel.id] },
    });
  }

  logger.info(`Registering vendor "${VENDOR.name}" (${VENDOR.email})...`);

  let authIdentityId: string;
  const registerResponse = await authModuleService.register("emailpass", {
    body: { email: VENDOR.email, password: DEMO_PASSWORD },
  });
  if (registerResponse.success && registerResponse.authIdentity) {
    authIdentityId = registerResponse.authIdentity.id;
  } else {
    const [providerIdentity] = await authModuleService.listProviderIdentities({
      entity_id: VENDOR.email,
      provider: "emailpass",
    });
    authIdentityId = providerIdentity.auth_identity_id!;
  }

  const { result: seller } = await createSellerAccountWorkflow(container).run({
    input: {
      auth_identity_id: authIdentityId,
      member_email: VENDOR.email,
      first_name: VENDOR.first_name,
      last_name: VENDOR.last_name,
      seller: {
        name: VENDOR.name,
        email: VENDOR.email,
        currency_code: CURRENCY_CODE,
        description: "A test vendor store, seeded for local demo purposes.",
      },
    },
  });

  await approveSellerWorkflow(container).run({
    input: { seller_id: seller.id },
  });

  const { data: members } = await query.graph({
    entity: "member",
    fields: ["id"],
    filters: { email: VENDOR.email },
  });
  const memberId = members[0].id;

  logger.info("Setting up vendor's warehouse and shipping...");

  const { result: stockLocations } = await createSellerStockLocationsWorkflow(
    container
  ).run({
    input: {
      seller_id: seller.id,
      locations: [
        {
          name: `${VENDOR.name} Warehouse`,
          address: {
            city: VENDOR.city,
            country_code: COUNTRY_CODE,
            address_1: VENDOR.address_1,
          },
        },
      ],
    },
  });
  const stockLocation = stockLocations[0];

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });
  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [defaultSalesChannel.id] },
  });
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { default_location_id: stockLocation.id },
    },
  });

  await createLocationFulfillmentSetWorkflow(container).run({
    input: {
      location_id: stockLocation.id,
      fulfillment_set_data: { name: `${VENDOR.name} delivery`, type: "shipping" },
    },
  });
  const {
    data: [locationWithSet],
  } = await query.graph({
    entity: "stock_location",
    fields: ["id", "fulfillment_sets.id"],
    filters: { id: stockLocation.id },
  });
  const fulfillmentSetId = locationWithSet?.fulfillment_sets?.[0]?.id;
  if (!fulfillmentSetId) {
    throw new Error(`Fulfillment set was not created for "${VENDOR.name}"`);
  }

  const { result: serviceZones } = await createServiceZonesWorkflow(
    container
  ).run({
    input: {
      data: [
        {
          fulfillment_set_id: fulfillmentSetId,
          name: `${VENDOR.name} Sri Lanka`,
          geo_zones: [{ country_code: COUNTRY_CODE, type: "country" as const }],
        },
      ],
    },
  });

  let [shippingProfile] = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
    filters: { name: "Marketplace Shipping" },
  }).then((r) => r.data);
  if (!shippingProfile) {
    const {
      result: [created],
    } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Marketplace Shipping", type: "default" }] },
    });
    shippingProfile = created;
  }

  await createSellerShippingOptionsWorkflow(container).run({
    input: {
      seller_id: seller.id,
      shipping_options: [
        {
          name: "Standard Shipping",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: serviceZones[0].id,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Standard",
            description: "Ship in 2-3 days.",
            code: "standard",
          },
          prices: [
            { currency_code: CURRENCY_CODE, amount: 350 },
            { region_id: region.id, amount: 350 },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    },
  });

  logger.info(`Creating product "${PRODUCT.title}"...`);

  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      created_by: memberId,
      products: [
        {
          title: PRODUCT.title,
          description: PRODUCT.description,
          handle: PRODUCT.handle,
          status: ProductStatus.PUBLISHED,
          thumbnail: PRODUCT.image,
          images: [{ url: PRODUCT.image }],
          seller_ids: [seller.id],
          variants: [{ title: "Default", sku: PRODUCT.sku }],
        },
      ],
    },
  });
  const product = products[0];

  const { data: seededProduct } = await query.graph({
    entity: "product",
    fields: ["id", "variants.id"],
    filters: { id: product.id },
  });
  const variantId = seededProduct[0].variants[0].id;

  logger.info("Creating vendor's offer (price + stock)...");

  await createOffersWorkflow(container).run({
    input: {
      offers: [
        {
          seller_id: seller.id,
          created_by: memberId,
          sku: PRODUCT.sku,
          variant_id: variantId,
          shipping_profile_id: shippingProfile.id,
          inventory_items: [
            {
              sku: PRODUCT.sku,
              stock_levels: [
                { location_id: stockLocation.id, stocked_quantity: PRODUCT.stock },
              ],
            },
          ],
          prices: [{ amount: PRODUCT.price, currency_code: CURRENCY_CODE }],
        },
      ],
    },
  });

  logger.info(`
Demo vendor seeded successfully.

  Vendor login:  ${VENDOR.email} / ${DEMO_PASSWORD}
  Product:       ${PRODUCT.title} (${PRODUCT.sku})
  Price:         LKR ${PRODUCT.price.toLocaleString()}
  Stock:         ${PRODUCT.stock} units
`);
}
