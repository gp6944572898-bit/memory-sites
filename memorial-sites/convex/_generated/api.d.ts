/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as admin from "../admin.js";
import type * as adminAdmins from "../adminAdmins.js";
import type * as adminComplaints from "../adminComplaints.js";
import type * as adminContent from "../adminContent.js";
import type * as adminDashboard from "../adminDashboard.js";
import type * as adminFinance from "../adminFinance.js";
import type * as adminGuestbook from "../adminGuestbook.js";
import type * as adminPages from "../adminPages.js";
import type * as adminQr from "../adminQr.js";
import type * as adminUsers from "../adminUsers.js";
import type * as appFiles from "../appFiles.js";
import type * as auditLog from "../auditLog.js";
import type * as auth from "../auth.js";
import type * as campaigns from "../campaigns.js";
import type * as complaints from "../complaints.js";
import type * as complaintsRules from "../complaintsRules.js";
import type * as console from "../console.js";
import type * as content from "../content.js";
import type * as crons from "../crons.js";
import type * as guestbook from "../guestbook.js";
import type * as guestbookRules from "../guestbookRules.js";
import type * as http from "../http.js";
import type * as macaly from "../macaly.js";
import type * as owner from "../owner.js";
import type * as ownerToken from "../ownerToken.js";
import type * as pages from "../pages.js";
import type * as permissions from "../permissions.js";
import type * as qr from "../qr.js";
import type * as qrRules from "../qrRules.js";
import type * as subdomain from "../subdomain.js";
import type * as subdomainRules from "../subdomainRules.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  admin: typeof admin;
  adminAdmins: typeof adminAdmins;
  adminComplaints: typeof adminComplaints;
  adminContent: typeof adminContent;
  adminDashboard: typeof adminDashboard;
  adminFinance: typeof adminFinance;
  adminGuestbook: typeof adminGuestbook;
  adminPages: typeof adminPages;
  adminQr: typeof adminQr;
  adminUsers: typeof adminUsers;
  appFiles: typeof appFiles;
  auditLog: typeof auditLog;
  auth: typeof auth;
  campaigns: typeof campaigns;
  complaints: typeof complaints;
  complaintsRules: typeof complaintsRules;
  console: typeof console;
  content: typeof content;
  crons: typeof crons;
  guestbook: typeof guestbook;
  guestbookRules: typeof guestbookRules;
  http: typeof http;
  macaly: typeof macaly;
  owner: typeof owner;
  ownerToken: typeof ownerToken;
  pages: typeof pages;
  permissions: typeof permissions;
  qr: typeof qr;
  qrRules: typeof qrRules;
  subdomain: typeof subdomain;
  subdomainRules: typeof subdomainRules;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
