/**
 * RevenueCat Seed Script for Roster App
 *
 * This script creates the RevenueCat products, entitlements, and offerings
 * that correspond to Roster's two paid tiers: Player Pro and Commissioner.
 *
 * Prerequisites:
 *   1. Set REVENUECAT_SECRET_API_KEY in your secrets (from RevenueCat dashboard → API Keys → Secret keys)
 *   2. (Optional) Set REVENUECAT_PROJECT_ID if you already have a project
 *
 * Run:
 *   npx tsx scripts/seedRevenueCat.ts
 *
 * After running, copy the logged environment variable values into your secrets.
 *
 * App Store Connect product IDs needed (create these in App Store Connect → In-App Purchases):
 *   - com.rosterapp.player_pro_monthly   ($6.49/month)
 *   - com.rosterapp.commissioner_monthly ($12.00/month)
 */

import { createClient } from '@replit/revenuecat-sdk/client';
import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from '@replit/revenuecat-sdk';

const SECRET_API_KEY = process.env.REVENUECAT_SECRET_API_KEY;
if (!SECRET_API_KEY) {
  console.error('ERROR: REVENUECAT_SECRET_API_KEY is not set. Add it to your secrets.');
  process.exit(1);
}

const PROJECT_NAME = 'Roster App';
const APP_STORE_APP_NAME = 'Roster';
const APP_STORE_BUNDLE_ID = 'com.rosterapp.ios'; // Update to your actual bundle ID

const PRODUCTS = [
  {
    identifier: 'com.rosterapp.player_pro_monthly',
    displayName: 'Player Pro Monthly',
    title: 'Player Pro',
    duration: 'P1M' as const,
    prices: [{ amount_micros: 6490000, currency: 'USD' }],
    entitlement: 'player_pro',
    packageKey: '$rc_monthly',
    offeringKey: 'player_pro',
    offeringName: 'Player Pro',
  },
  {
    identifier: 'com.rosterapp.commissioner_monthly',
    displayName: 'Commissioner Monthly',
    title: 'Commissioner',
    duration: 'P1M' as const,
    prices: [{ amount_micros: 12000000, currency: 'USD' }],
    entitlement: 'commissioner',
    packageKey: '$rc_monthly',
    offeringKey: 'commissioner',
    offeringName: 'Commissioner',
  },
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedRevenueCat() {
  const client = createClient({
    baseUrl: 'https://api.revenuecat.com/v2',
    headers: { Authorization: `Bearer ${SECRET_API_KEY}` },
  });

  // --- Project ---
  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError) throw new Error('Failed to list projects: ' + JSON.stringify(listProjectsError));

  const found = existingProjects.items?.find((p) => p.name === PROJECT_NAME);
  if (found) {
    console.log('Project already exists:', found.id);
    project = found;
  } else {
    const { data: newProject, error } = await createProject({ client, body: { name: PROJECT_NAME } });
    if (error) throw new Error('Failed to create project: ' + JSON.stringify(error));
    console.log('Created project:', newProject.id);
    project = newProject;
  }

  // --- Apps ---
  const { data: appsData, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError) throw new Error('Failed to list apps');

  let testStoreApp: App | undefined = appsData.items.find((a) => a.type === 'test_store');
  let appStoreApp: App | undefined = appsData.items.find((a) => a.type === 'app_store');

  if (!testStoreApp) throw new Error('No test store app found. Create a RevenueCat project first.');
  console.log('Test Store App:', testStoreApp.id);

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: APP_STORE_APP_NAME,
        type: 'app_store',
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error('Failed to create App Store app: ' + JSON.stringify(error));
    appStoreApp = newApp;
    console.log('Created App Store app:', appStoreApp.id);
  } else {
    console.log('App Store App:', appStoreApp.id);
  }

  // --- Products ---
  const { data: existingProductsData, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error('Failed to list products');

  const ensureProduct = async (targetApp: App, label: string, identifier: string, productData: any, isTestStore: boolean): Promise<Product> => {
    const existing = existingProductsData.items?.find(
      (p) => p.store_identifier === identifier && p.app_id === targetApp.id
    );
    if (existing) {
      console.log(`${label} product already exists:`, existing.id);
      return existing;
    }
    const body: CreateProductData['body'] = {
      store_identifier: identifier,
      app_id: targetApp.id,
      type: 'subscription',
      display_name: productData.displayName,
    };
    if (isTestStore) {
      body.subscription = { duration: productData.duration };
      body.title = productData.title;
    }
    const { data: created, error } = await createProduct({ client, path: { project_id: project.id }, body });
    if (error) throw new Error(`Failed to create ${label} product: ` + JSON.stringify(error));
    console.log(`Created ${label} product:`, created.id);
    return created;
  };

  const productMap: Record<string, { test: Product; appStore: Product }> = {};
  for (const prod of PRODUCTS) {
    const testProd = await ensureProduct(testStoreApp, `Test Store (${prod.displayName})`, prod.identifier, prod, true);
    const appProd = await ensureProduct(appStoreApp, `App Store (${prod.displayName})`, prod.identifier, prod, false);

    // Add test store prices
    const { error: priceError } = await client.post<TestStorePricesResponse>({
      url: '/projects/{project_id}/products/{product_id}/test_store_prices',
      path: { project_id: project.id, product_id: testProd.id },
      body: { prices: prod.prices },
    });
    if (priceError && (priceError as any)?.type !== 'resource_already_exists') {
      console.warn('Failed to set test store prices (may already be set):', priceError);
    } else {
      console.log(`Set test store prices for ${prod.displayName}`);
    }

    productMap[prod.identifier] = { test: testProd, appStore: appProd };
  }

  // --- Entitlements ---
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntitlementsError) throw new Error('Failed to list entitlements');

  for (const prod of PRODUCTS) {
    let entitlement: Entitlement | undefined;
    const existingEnt = existingEntitlements.items?.find((e) => e.lookup_key === prod.entitlement);
    if (existingEnt) {
      console.log(`Entitlement '${prod.entitlement}' already exists:`, existingEnt.id);
      entitlement = existingEnt;
    } else {
      const { data: newEnt, error } = await createEntitlement({
        client,
        path: { project_id: project.id },
        body: { lookup_key: prod.entitlement, display_name: prod.displayName },
      });
      if (error) throw new Error('Failed to create entitlement: ' + JSON.stringify(error));
      console.log(`Created entitlement '${prod.entitlement}':`, newEnt.id);
      entitlement = newEnt;
    }

    const products = productMap[prod.identifier];
    const { error: attachErr } = await attachProductsToEntitlement({
      client,
      path: { project_id: project.id, entitlement_id: entitlement.id },
      body: { product_ids: [products.test.id, products.appStore.id] },
    });
    if (attachErr && (attachErr as any)?.type !== 'unprocessable_entity_error') {
      throw new Error('Failed to attach products to entitlement: ' + JSON.stringify(attachErr));
    } else {
      console.log(`Attached products to entitlement '${prod.entitlement}'`);
    }
  }

  // --- Offerings ---
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error('Failed to list offerings');

  for (const prod of PRODUCTS) {
    let offering: Offering | undefined;
    const existingOff = existingOfferings.items?.find((o) => o.lookup_key === prod.offeringKey);
    if (existingOff) {
      console.log(`Offering '${prod.offeringKey}' already exists:`, existingOff.id);
      offering = existingOff;
    } else {
      const { data: newOff, error } = await createOffering({
        client,
        path: { project_id: project.id },
        body: { lookup_key: prod.offeringKey, display_name: prod.offeringName },
      });
      if (error) throw new Error('Failed to create offering: ' + JSON.stringify(error));
      console.log(`Created offering '${prod.offeringKey}':`, newOff.id);
      offering = newOff;
    }

    const { data: existingPkgs, error: listPkgsError } = await listPackages({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      query: { limit: 20 },
    });
    if (listPkgsError) throw new Error('Failed to list packages');

    let pkg: Package | undefined;
    const existingPkg = existingPkgs.items?.find((p) => p.lookup_key === prod.packageKey);
    if (existingPkg) {
      console.log(`Package '${prod.packageKey}' already exists:`, existingPkg.id);
      pkg = existingPkg;
    } else {
      const { data: newPkg, error } = await createPackages({
        client,
        path: { project_id: project.id, offering_id: offering.id },
        body: { lookup_key: prod.packageKey, display_name: `${prod.offeringName} Monthly` },
      });
      if (error) throw new Error('Failed to create package: ' + JSON.stringify(error));
      console.log(`Created package '${prod.packageKey}':`, newPkg.id);
      pkg = newPkg;
    }

    const products = productMap[prod.identifier];
    const { error: attachPkgErr } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: [
          { product_id: products.test.id, eligibility_criteria: 'all' },
          { product_id: products.appStore.id, eligibility_criteria: 'all' },
        ],
      },
    });
    if (attachPkgErr && !(attachPkgErr as any)?.message?.includes('Cannot attach product')) {
      throw new Error('Failed to attach products to package: ' + JSON.stringify(attachPkgErr));
    } else {
      console.log(`Attached products to package '${prod.packageKey}'`);
    }
  }

  // --- API Keys ---
  const { data: testKeys } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: testStoreApp.id },
  });
  const { data: appStoreKeys } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: appStoreApp.id },
  });

  console.log('\n====================');
  console.log('RevenueCat setup complete!');
  console.log('\nAdd these to your secrets:');
  console.log('REVENUECAT_PROJECT_ID=' + project.id);
  console.log('VITE_REVENUECAT_IOS_PUBLIC_KEY=' + (appStoreKeys?.items?.[0]?.key ?? 'NOT_FOUND'));
  console.log('VITE_REVENUECAT_TEST_PUBLIC_KEY=' + (testKeys?.items?.[0]?.key ?? 'NOT_FOUND'));
  console.log('\nApp Store Connect — create these product IDs:');
  for (const prod of PRODUCTS) {
    console.log(`  ${prod.identifier}  (${prod.prices[0].amount_micros / 1_000_000} USD/month)`);
  }
  console.log('====================\n');
}

seedRevenueCat().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
