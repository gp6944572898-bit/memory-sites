// Свой поддомен для страницы памяти: проверка уникальности и закрепление.
//
// Пока здесь только хранение и проверка имени. Открытие сайта по адресу
// <имя>.<домен> включается отдельно, когда подключён wildcard-домен.
import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { normalizeSubdomain, validateSubdomain } from "./subdomainRules"

const checkResult = v.object({
  available: v.boolean(),
  // Причина недоступности (на русском) — показывается под полем ввода.
  reason: v.optional(v.string()),
})

// Проверка «можно ли занять это имя» — вызывается пока человек печатает.
// Если передан токен владельца и имя уже закреплено за этой же страницей,
// оно считается доступным (повторное сохранение того же имени).
export const check = query({
  args: { subdomain: v.string(), ownerToken: v.optional(v.string()) },
  returns: checkResult,
  handler: async (ctx, { subdomain, ownerToken }) => {
    const value = normalizeSubdomain(subdomain)
    const error = validateSubdomain(value)
    if (error) return { available: false, reason: error }

    const taken = await ctx.db
      .query("pages")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", value))
      .unique()
    if (!taken) return { available: true }
    if (ownerToken && taken.ownerToken === ownerToken) return { available: true }
    return { available: false, reason: "Это имя уже занято" }
  },
})

// Закрепляет поддомен за страницей. Права — по секретному токену владельца,
// как и в остальной панели владельца. Mutation в Convex выполняется
// транзакционно, поэтому два человека не смогут занять одно имя одновременно.
export const claim = mutation({
  args: { ownerToken: v.string(), subdomain: v.string() },
  returns: v.object({ subdomain: v.string() }),
  handler: async (ctx, { ownerToken, subdomain }) => {
    const page = await ctx.db
      .query("pages")
      .withIndex("by_owner_token", (q) => q.eq("ownerToken", ownerToken))
      .unique()
    if (!page) throw new Error("Страница не найдена")

    const value = normalizeSubdomain(subdomain)
    const error = validateSubdomain(value)
    if (error) throw new Error(error)

    const taken = await ctx.db
      .query("pages")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", value))
      .unique()
    if (taken && taken._id !== page._id) throw new Error("Это имя уже занято")

    await ctx.db.patch(page._id, { subdomain: value })
    return { subdomain: value }
  },
})

// По поддомену находит адрес страницы — понадобится маршрутизации
// <имя>.<домен>. Заблокированные страницы не отдаются.
export const resolve = query({
  args: { subdomain: v.string() },
  returns: v.union(v.null(), v.object({ slug: v.string() })),
  handler: async (ctx, { subdomain }) => {
    const value = normalizeSubdomain(subdomain)
    const page = await ctx.db
      .query("pages")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", value))
      .unique()
    if (!page || page.status === "blocked") return null
    return { slug: page.slug }
  },
})
