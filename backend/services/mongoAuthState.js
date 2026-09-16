const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const WhatsAppSession = require('../models/WhatsAppSession');

/**
 * MongoDB-backed authentication state adapter for Baileys.
 * Serializes cryptographic keys and auth tokens into MongoDB Atlas,
 * ensuring the WhatsApp session persists across Render redeploys and restarts.
 */
async function useMongoAuthState(sessionId = 'default') {
  const credsDoc = await WhatsAppSession.findById(`${sessionId}:creds`);
  let creds;
  if (credsDoc && credsDoc.data) {
    try {
      creds = JSON.parse(credsDoc.data, BufferJSON.reviver);
    } catch (e) {
      console.error('Failed to parse creds from MongoDB:', e.message);
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          const keysToFetch = ids.map((id) => `${sessionId}:${type}:${id}`);
          const docs = await WhatsAppSession.find({ _id: { $in: keysToFetch } });
          for (const doc of docs) {
            try {
              let parsed = JSON.parse(doc.data, BufferJSON.reviver);
              if (type === 'app-state-sync-key' && parsed) {
                parsed = proto.Message.AppStateSyncKeyData.fromObject(parsed);
              }
              const keyId = doc._id.replace(`${sessionId}:${type}:`, '');
              data[keyId] = parsed;
            } catch (err) {
              console.warn(`Failed to parse session key ${doc._id}:`, err.message);
            }
          }
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${sessionId}:${category}:${id}`;
              if (value) {
                tasks.push(
                  WhatsAppSession.updateOne(
                    { _id: key },
                    { $set: { data: JSON.stringify(value, BufferJSON.replacer), updatedAt: new Date() } },
                    { upsert: true }
                  )
                );
              } else {
                tasks.push(WhatsAppSession.deleteOne({ _id: key }));
              }
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await WhatsAppSession.updateOne(
        { _id: `${sessionId}:creds` },
        { $set: { data: JSON.stringify(creds, BufferJSON.replacer), updatedAt: new Date() } },
        { upsert: true }
      );
    },
    clearSession: async () => {
      await WhatsAppSession.deleteMany({ _id: new RegExp(`^${sessionId}:`) });
    },
  };
}

module.exports = { useMongoAuthState };
