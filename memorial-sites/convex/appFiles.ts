import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, internalQuery, type ActionCtx } from "./_generated/server"
import { callMacalyJson } from "./macaly"

const APP_FILES_PROTOCOL = "bindings_v1" as const

const uploadGrant = v.object({
  fileId: v.string(),
  uploadUrl: v.string(),
  method: v.literal("PUT"),
  headers: v.record(v.string(), v.string()),
  expiresAt: v.string(),
  maxBytes: v.number(),
})

export const getCurrentAppUserId = internalQuery({
  args: {},
  returns: v.id("users"),
  handler: async (ctx): Promise<Id<"users">> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Authentication required")
    return userId
  },
})

async function requireAppUserId(
  ctx: Pick<ActionCtx, "runQuery">,
): Promise<Id<"users">> {
  return ctx.runQuery(internal.appFiles.getCurrentAppUserId, {})
}

function databaseEnvironment() {
  return process.env.MACALY_DATABASE_ENVIRONMENT === "development"
    ? "development"
    : "production"
}

export const createUpload = action({
  args: {
    filename: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    visibility: v.union(v.literal("public"), v.literal("private")),
  },
  returns: uploadGrant,
  handler: async (ctx, args) => {
    const appUserId = await requireAppUserId(ctx)
    const response = await callMacalyJson(
      "/api/client-app/app-files/create-upload",
      {
        ...args,
        protocolVersion: APP_FILES_PROTOCOL,
        databaseEnvironment: databaseEnvironment(),
        appSubjectId: appUserId,
      },
    )
    return response.upload as {
      fileId: string
      uploadUrl: string
      method: "PUT"
      headers: Record<string, string>
      expiresAt: string
      maxBytes: number
    }
  },
})

async function completeAppFile(
  ctx: Pick<ActionCtx, "runQuery">,
  fileId: string,
) {
  const appUserId = await requireAppUserId(ctx)
  const response = await callMacalyJson(
    "/api/client-app/app-files/complete-upload",
    {
      fileId,
      protocolVersion: APP_FILES_PROTOCOL,
      databaseEnvironment: databaseEnvironment(),
      appSubjectId: appUserId,
    },
  )
  return response.file as {
    fileId: string
    status: "ready"
    contentType: string
    fileSize: number
    visibility: "public" | "private"
    url: string | null
  }
}

async function deleteAppFile(ctx: Pick<ActionCtx, "runQuery">, fileId: string) {
  const appUserId = await requireAppUserId(ctx)
  const response = await callMacalyJson("/api/client-app/app-files/delete", {
    fileId,
    protocolVersion: APP_FILES_PROTOCOL,
    databaseEnvironment: databaseEnvironment(),
    appSubjectId: appUserId,
  })
  return {
    success: response.success === true,
    cleanupPending: response.cleanupPending === true,
  }
}

export const finalizePhotoUpload = action({
  args: { fileId: v.string() },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const uploaded = await completeAppFile(ctx, args.fileId)
    if (!uploaded.url) {
      await deleteAppFile(ctx, uploaded.fileId).catch(() => undefined)
      throw new Error("Upload did not return a public URL")
    }
    return { url: uploaded.url }
  },
})
