import { httpAction, internalMutation } from "./_generated/server";
import { apiMutation } from "./middleware";
import { v } from "convex/values";
import type { Id } from "../convex/_generated/dataModel.d.ts"
import { api, components, internal } from "./_generated/api";
import { ShardedCounter } from "@convex-dev/sharded-counter";

const counter = new ShardedCounter(components.shardedCounter);
//TODO: When creating new relationships for an existing sheet, we ought to make sure that a dedup task is scheduled..

export const increaseRowCount = internalMutation({
    args: {
        counts: v.array(v.object({
            sheet_id: v.id("sheet"),
            count: v.number()
        }))
    }, 
    handler: async (ctx, args) => {
        // Iterate through the keys and counts and save them
        for (const pair of args.counts) {
            const sheet_row_counter = counter.for(pair.sheet_id)
            sheet_row_counter.add(ctx, pair.count)
        }
    }
})

export const insert = apiMutation({
    args: {
        pairs: v.array(v.object({
            sheet_id: v.id("sheet"),
            row_id: v.id("row"),
            row_number: v.number()
        }))
        
    },
    handler: async (ctx, args) => {
        const rowCounts = new Map<Id<"sheet">, number>();
        for (const pair of args.pairs) {
            const row_id = pair.row_id;
            const sheet_id = pair.sheet_id;
            const row_number = pair.row_number;

            await ctx.db.insert("relationships", { row_id, sheet_id, row_number });
            rowCounts.set(pair.sheet_id, (rowCounts.get(pair.sheet_id) || 0) + 1);
        }

        const unwrappedRowCounts = []
        for (const [key, value] of rowCounts.entries()) {
            unwrappedRowCounts.push({sheet_id: key, count: value})
        }
        
        await ctx.scheduler.runAfter(10, internal.relationships.increaseRowCount, {
            counts: unwrappedRowCounts,
        });
    }
})

export const createRelationshipFromHttp = httpAction(async (ctx, req) => {
    const { relationships, apiKey } = await req.json();

    const pairs = [];
    for (const relationship of relationships) { 
        pairs.push({
            sheet_id: relationship.sheet_id as Id<"sheet">,
            row_id: relationship.row_id,
            row_number: relationship.row_number
        })
    }

    console.time("Mutation start"); // Start timing

    await ctx.runMutation(api.relationships.insert, { pairs: pairs, apiKey: apiKey });

    console.timeEnd("Mutation start"); // end timing


    return new Response("Relationships created", { status: 200 });
})