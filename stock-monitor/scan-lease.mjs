// Short storage-only calls: network scans run in Queue Workers.
export class ScanLease {
 constructor(storage, now=()=>Date.now()) { this.storage=storage; this.now=now; this.tail=Promise.resolve(); }
 exclusive(fn) { const task=this.tail.then(fn); this.tail=task.catch(()=>{}); return task; }
 claim(job) { return this.exclusive(async()=>{
  const now=this.now(), periods={'stock-scan':180000,'usdg-scan':180000,'xlayer-volume':300000};
  if(!periods[job?.kind]||!Number.isFinite(job.requestedAt)||job.requestedAt>now+60000||now-job.requestedAt>360000)return {skipped:'expired'};
  const slot=Math.floor(job.requestedAt/periods[job.kind]);
  if((await this.storage.get('scan-completed:'+job.kind))>=slot)return {skipped:'duplicate'};
  const active=await this.storage.get('scan-lease-v1');
  if(active?.until>now)return {skipped:'busy'};
  const lease={token:crypto.randomUUID(),until:now+16*60000,kind:job.kind,slot};
  await this.storage.put('scan-lease-v1',lease); return lease;
 }); }
 async assert(token) { const lease=await this.storage.get('scan-lease-v1'); if(!token||lease?.token!==token||lease.until<=this.now())throw Error('Scan lease lost'); return lease; }
 finish(token, success) { return this.exclusive(async()=>{
  const lease=await this.storage.get('scan-lease-v1'); if(lease?.token!==token)return false;
  if(success&&lease.until>this.now())await this.storage.put('scan-completed:'+lease.kind,lease.slot);
  await this.storage.put('scan-lease-v1',{...lease,until:0}); return true;
 }); }
 write(token, operation) { return this.exclusive(async()=>{await this.assert(token); return operation();}); }
}
