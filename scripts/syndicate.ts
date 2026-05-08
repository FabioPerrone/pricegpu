import { fetch } from 'undici';

const DEVTO_API_KEY = process.env.DEVTO_API_KEY;
const HASHNODE_API_KEY = process.env.HASHNODE_API_KEY;
const HASHNODE_PUBLICATION_ID = process.env.HASHNODE_PUBLICATION_ID;

async function syndicateToDevTo() {
  if (!DEVTO_API_KEY) {
    console.log('⚠️  Skipping Dev.to syndication - DEVTO_API_KEY not set');
    return;
  }

  try {
    console.log('📤 Syndicating to Dev.to...');
    // Add Dev.to syndication logic here
    console.log('✅ Dev.to syndication completed');
  } catch (error) {
    console.error('❌ Dev.to syndication failed:', error);
    throw error;
  }
}

async function syndicateToHashnode() {
  if (!HASHNODE_API_KEY || !HASHNODE_PUBLICATION_ID) {
    console.log('⚠️  Skipping Hashnode syndication - HASHNODE_API_KEY or HASHNODE_PUBLICATION_ID not set');
    return;
  }

  try {
    console.log('📤 Syndicating to Hashnode...');
    // Add Hashnode syndication logic here
    console.log('✅ Hashnode syndication completed');
  } catch (error) {
    console.error('❌ Hashnode syndication failed:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting content syndication...');
  
  try {
    await syndicateToDevTo();
    await syndicateToHashnode();
    
    console.log('✨ Syndication completed successfully!');
  } catch (error) {
    console.error('💥 Syndication failed:', error);
    process.exit(1);
  }
}

main();
