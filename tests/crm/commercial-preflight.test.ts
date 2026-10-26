import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('008 rechaza la falta de 006 antes de crear tablas y el preflight es solo lectura',async()=>{
 const db=new PGlite();try{
  await db.exec('create table public.crm_leads(id uuid,capture_metadata jsonb)');
  const migration=await readFile('supabase/migrations/202610260008_commercial_journey.sql','utf8');
  await assert.rejects(()=>db.exec(migration),/AI_OS_PRECHECK:.*006/);
  await db.exec('rollback');
  assert.equal((await db.query<{missing:boolean}>("select to_regclass('public.crm_commercial_events') is null missing")).rows[0].missing,true);
  const audit=(await db.query<{preflight:{ceo:{leads:boolean};ai_os:{capture_metadata_005:boolean;capture_sources_006:boolean}}}>(await readFile('docs/sql/commercial-project-preflight.sql','utf8'))).rows[0].preflight;
  assert.equal(audit.ceo.leads,false);assert.equal(audit.ai_os.capture_metadata_005,true);assert.equal(audit.ai_os.capture_sources_006,false);
 }finally{await db.close();}
});
