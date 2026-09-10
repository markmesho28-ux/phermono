const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://optlbyqsxeudyiybwygo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdGxieXFzeGV1ZHlpeWJ3eWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4Nzk4NzEsImV4cCI6MjEwNDQ1NTg3MX0.ytT4ZHYKsjD_bBL1YeBzyTG4fF1smBfK--IIzr6RHf8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  try {
    console.log('Fetching subcategories (limit 20)...');
    const { data: subs, error: subsErr } = await supabase.from('subcategories').select('id,category_id,name,slug,created_at').limit(20);
    if (subsErr) {
      console.error('Error fetching subcategories:', subsErr.message || subsErr);
    } else {
      console.log('Subcategories (first 20):');
      console.log(JSON.stringify(subs, null, 2));
    }

    console.log('\nFetching recent products (limit 50, ordered by created_at desc)...');
    const { data: prods, error: prodErr } = await supabase.from('products').select('*').order('created_at', { ascending: false }).limit(50);
    if (prodErr) {
      console.error('Error fetching products:', prodErr.message || prodErr);
    } else {
      console.log('Recent products (first 50):');
      console.log(JSON.stringify(prods, null, 2));
      // check for subcategory fields presence
      const keys = new Set();
      (prods || []).forEach(p => Object.keys(p || {}).forEach(k => keys.add(k)));
      console.log('\nUnion of product columns in returned rows:');
      console.log(Array.from(keys).sort());
      const hasSubcategoryCols = Array.from(keys).filter(k => k.toLowerCase().includes('subcat') || k.toLowerCase().includes('subcategory'));
      console.log('Detected subcategory-like columns:', hasSubcategoryCols);
    }

    // Look for any product with name LIKE 'PERSIST COUNT TEST'
    console.log("\nSearching for existing test products named 'PERSIST COUNT TEST'...");
    const { data: found, error: foundErr } = await supabase.from('products').select('*').ilike('name', '%PERSIST COUNT TEST%').limit(100);
    if (foundErr) {
      console.error('Error searching for test products:', foundErr.message || foundErr);
    } else {
      console.log('Found test products:');
      console.log(JSON.stringify(found, null, 2));
    }

    // If there is at least one subcategory, attempt a controlled insert and then select it back.
    if (Array.isArray(subs) && subs.length > 0) {
      const target = subs[0];
      const testName = `PERSIST COUNT TEST ${Date.now()}`;
      console.log('\nUsing subcategory:', JSON.stringify(target, null, 2));
      // Prepare payload attempting to include subcategory_id (may fail if column missing)
      const payloadWithSubId = {
        name: testName,
        brand: 'test-brand',
        category_id: target.category_id ?? null,
        subcategory_id: target.id,
        selling_price: 1.0,
        market_price: 1.0,
        admin_cost: 0.5,
        image: null,
        description: 'Controlled persistence test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log('\nAttempting INSERT with `subcategory_id` in payload:');
      console.log(JSON.stringify(payloadWithSubId, null, 2));
      const { data: ins1, error: insErr1 } = await supabase.from('products').insert([payloadWithSubId]).select().maybeSingle();
      if (insErr1) {
        console.error('Insert with subcategory_id failed:', insErr1.message || insErr1);
      } else {
        console.log('Insert with subcategory_id returned:', JSON.stringify(ins1, null, 2));
      }

      // Insert without subcategory_id
      const payloadNoSub = { ...payloadWithSubId };
      delete payloadNoSub.subcategory_id;
      payloadNoSub.name = `${testName}-NOSUB`;
      console.log('\nAttempting INSERT without `subcategory_id` in payload:');
      console.log(JSON.stringify(payloadNoSub, null, 2));
      const { data: ins2, error: insErr2 } = await supabase.from('products').insert([payloadNoSub]).select().maybeSingle();
      if (insErr2) {
        console.error('Insert without subcategory failed:', insErr2.message || insErr2);
      } else {
        console.log('Insert without subcategory returned:', JSON.stringify(ins2, null, 2));
      }

      // Now search for these inserted products by name
      const { data: check1, error: checkErr1 } = await supabase.from('products').select('*').eq('name', payloadWithSubId.name).limit(1).maybeSingle();
      if (checkErr1) console.error('Error fetching product by exact name:', checkErr1.message || checkErr1);
      console.log('\nFresh SELECT for product with name (with sub):', JSON.stringify(check1, null, 2));

      const { data: check2, error: checkErr2 } = await supabase.from('products').select('*').eq('name', payloadNoSub.name).limit(1).maybeSingle();
      if (checkErr2) console.error('Error fetching product by exact name:', checkErr2.message || checkErr2);
      console.log('\nFresh SELECT for product without sub:', JSON.stringify(check2, null, 2));

    } else {
      console.log('No subcategories available to run controlled insert test.');
    }

  } catch (e) {
    console.error('Unexpected error during DB probe:', e);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
