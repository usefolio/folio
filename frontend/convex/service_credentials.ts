import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "./middleware";
import sodium from "libsodium-wrappers-sumo";

// Encryption key - in reality this would be stored securely
const SERVER_PUBLIC_B64 : string = process.env.SERVER_PUBLIC_B64!
const SERVER_SECRET_B64 : string = process.env.SERVER_SECRET_B64! 

async function verifyEncryptionKeys() {
  if (!SERVER_PUBLIC_B64 || !SERVER_SECRET_B64) {
    throw new Error("Something went wrong during encryption or decryption of the API key");
  }
}


async function encryptApiKey(plain: string): Promise<string> {
  await sodium.ready; 
  verifyEncryptionKeys();                                   // WASM loads
  const serverPubKey = sodium.from_base64(
    SERVER_PUBLIC_B64,
    sodium.base64_variants.ORIGINAL       // or ORIGINAL_NO_PADDING if you drop the “=”
  );
  const cipher = sodium.crypto_box_seal(
    new TextEncoder().encode(plain),
    serverPubKey,
  );
  return sodium.to_base64(cipher);                     // save this in Convex
}

async function decryptApiKey(cipherB64: string): Promise<string> {
  await sodium.ready;

  // ciphertext came from sodium.to_base64(...) in the browser,
  // whose default is URL-safe, no padding
  const cipher = sodium.from_base64(
    cipherB64,
    sodium.base64_variants.URLSAFE_NO_PADDING
  );

  verifyEncryptionKeys()
  // keys were exported with sodium.to_base64(..., ORIGINAL)
  const sk = sodium.from_base64(
    SERVER_SECRET_B64,
    sodium.base64_variants.ORIGINAL
  );
  const pk = sodium.from_base64(
    SERVER_PUBLIC_B64,
    sodium.base64_variants.ORIGINAL
  );

  const plainBytes = sodium.crypto_box_seal_open(cipher, pk, sk);
  return new TextDecoder().decode(plainBytes);
}

// Save a service credential
export const saveServiceCredential = authenticatedMutation({
  args: {
    workspaceId: v.id("workspace"),
    service: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspaceId, service, apiKey } = args;

    // Check if the user has access to this workspace
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("You must be logged in to save API keys");
    }

    // Check if user is a member of the workspace (Corrected table name if needed)
    const membership = await ctx.db
      .query("worskpaceMembership")
      .withIndex("by_user", (q) => q.eq("user_id", user.tokenIdentifier))
      .filter((q) => q.eq(q.field("workspace_id"), workspaceId))
      .unique();

    if (!membership) {
      throw new Error("You do not have access to this workspace");
    }

    // Check for existing credential
    const existingCredential = await ctx.db
      .query("service_credentials") // Ensure this table name is correct
      .withIndex("by_workspace", (q) => q.eq("workspace_id", workspaceId))
      .filter((q) => q.eq(q.field("service"), service))
      .unique();

    const encryptedApiKey = await encryptApiKey(apiKey);

    if (existingCredential) {
      // Update existing credential
      await ctx.db.patch(existingCredential._id, {
        encrypted_api_key: encryptedApiKey,
        last_modified: Date.now(),
      });

      return existingCredential._id;
    } else {
      // Create new credential
      const newCredentialId = await ctx.db.insert("service_credentials", {
        workspace_id: workspaceId,
        service,
        encrypted_api_key: encryptedApiKey,
        last_modified: Date.now(),
      });

      return newCredentialId;
    }
  },
});

// List all service credentials for a workspace
export const getServiceCredentials = authenticatedQuery({
  args: {
    workspaceId: v.id("workspace"),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = args;

    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("You must be logged in to view API keys");
    }
    
    // Check if user is a member of the workspace
    const membership = await ctx.db
      .query("worskpaceMembership")
      .withIndex("by_user", (q) => q.eq("user_id", user.tokenIdentifier))
      .filter((q) => q.eq(q.field("workspace_id"), workspaceId))
      .unique();
    
    if (!membership) {
      throw new Error("You do not have access to this workspace");
    }
    
    // Get all credentials for this workspace
    const credentials = await ctx.db
      .query("service_credentials")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", workspaceId))
      .collect();

    return await Promise.all(credentials.map(async (cred) => {
      try {
        const apiKey = cred.encrypted_api_key
          ? await decryptApiKey(cred.encrypted_api_key) // Assuming decryptBytes handles ArrayBuffer
          : "";

        return {
          id: cred._id,
          service: cred.service,
          apiKey,
          lastModified: cred.last_modified,
        };
      } catch (error) {
        console.error(`Error decrypting key for ${cred.service} (ID: ${cred._id}):`, error);
        return {
          id: cred._id,
          service: cred.service,
          apiKey: "[Decryption Error]",
          lastModified: cred.last_modified,
        };
      }
    }));
  },
});

// Get the current user's workspace
export const getCurrentUserWorkspace = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("You must be logged in");
    }
    
    // Find the workspace membership for this user
    const membership = await ctx.db
      .query("worskpaceMembership")
      .withIndex("by_user", (q) => q.eq("user_id", user.tokenIdentifier))
      .first();
      
    // User has no workspace yet
    if (!membership) {
      return null; 
    }
    
    // Get the workspace details
    const workspace = await ctx.db.get(membership.workspace_id);
    return workspace;
  },
});

// Create a default workspace for a user if they don't have one
export const createDefaultWorkspace = authenticatedMutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("You must be logged in");
    }
    
    // Check if user already has a workspace
    const existingMembership = await ctx.db
      .query("worskpaceMembership")
      .withIndex("by_user", (q) => q.eq("user_id", user.tokenIdentifier))
      .first();
    
    if (existingMembership) {
      const workspace = await ctx.db.get(existingMembership.workspace_id);
      return workspace;
    }
    
    // Create a new workspace
    const workspaceId = await ctx.db.insert("workspace", {
      name: args.name,
      created_by: user.tokenIdentifier,
    });
    
    // Add the user as an admin to the workspace
    await ctx.db.insert("worskpaceMembership", {
      user_id: user.tokenIdentifier,
      workspace_id: workspaceId,
      role: "admin",
    });
    
    const workspace = await ctx.db.get(workspaceId);
    return workspace;
  },
});