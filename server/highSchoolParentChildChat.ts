import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ParentSql } from "./highSchoolParentSecurity";
import { OnboardingError } from "./highSchoolOnboarding";

type Db=Pick<ParentSql,"query">;
export async function parentChildChatInstalled(db:Db) {
  return !!(await db.query("SELECT to_regclass('hs_onboarding.parent_child_messages') AS installed")).rows[0]?.installed;
}
export async function requireParentChildChat(db:Db) {
  if(!await parentChildChatInstalled(db))throw new OnboardingError("CHILD_CHAT_UPGRADE_REQUIRED",503);
}
// Only call after the caller's canonical parent/child authority is verified.
export async function readParentChildMessages(db:Db,childId:string,parentId:string,perspective:"parent"|"child") {
  const rows=(await db.query(`SELECT id,body,created_at AS "createdAt",author_kind AS "authorKind"
    FROM hs_onboarding.parent_child_messages WHERE child_id=$1 AND parent_auth_id=$2
    ORDER BY created_at DESC,id DESC LIMIT 100`,[childId,parentId])).rows.reverse();
  return {messages:rows.map(row=>({...row,sender:row.authorKind===perspective?"You":perspective==="child"?"Parent":"Child"}))};
}
export async function writeParentChildMessage(db:Db,childId:string,parentId:string,author:"parent"|"child",input:unknown) {
  const data=z.object({body:z.string().trim().min(1).max(1000),requestId:z.string().uuid().optional()}).strict().parse(input);
  const requestId=data.requestId??randomUUID();
  const result=await db.query(`INSERT INTO hs_onboarding.parent_child_messages
    (id,child_id,parent_auth_id,author_kind,body,request_id) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(child_id,author_kind,request_id) DO UPDATE SET request_id=EXCLUDED.request_id
    RETURNING id`,[randomUUID(),childId,parentId,author,data.body,requestId]);
  return {saved:true,id:result.rows[0].id};
}
