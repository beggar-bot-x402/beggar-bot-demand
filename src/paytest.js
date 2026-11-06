// Static x402 payment page (Base mainnet or Base Sepolia). No keys here: the user's wallet signs EIP-3009 typed data.
// chainId is derived from the 402 accepts[].network (base -> 8453, base-sepolia -> 84532), never hardcoded.
export const PAY_TEST_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Beggar Bot x402 payment test</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:1em auto;padding:0 1em}button{font-size:1.1em;padding:.6em 1em;margin:.3em 0;width:100%}input{width:100%;font-size:.9em;padding:.4em;box-sizing:border-box}pre{white-space:pre-wrap;word-break:break-all;background:#f4f4f4;padding:.6em;font-size:.8em}</style></head><body>
<h2>x402 payment test</h2>
<p>Fetches the 402 challenge, switches your wallet to the network it names (Base mainnet 8453 or Base Sepolia 84532), and asks you to sign one EIP-3009 USDC authorization. No gas. Mainnet payments above 0.02 USDC are refused by this page.</p>
<label>Resource URL<input id="api"></label>
<button id="b1">1. Connect wallet</button>
<button id="b2" disabled>2. Get 402 challenge + switch network</button>
<button id="b3" disabled>3. Sign &amp; pay</button>
<pre id="log">Open this page in MetaMask's in-app browser.</pre>
<script>
const NETS={"base":{id:8453,name:"Base",rpc:"https://mainnet.base.org",exp:"https://basescan.org",usdc:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",max:20000},
  "base-sepolia":{id:84532,name:"Base Sepolia",rpc:"https://sepolia.base.org",exp:"https://sepolia.basescan.org",usdc:"0x036CbD53842c5426634e7929541eC2318f3dCF7e",max:1000000}};
const TEST=/-test\\./.test(location.hostname);
document.getElementById("api").value=location.origin+(TEST?"/v1/risk?network=base-sepolia&address=0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7":"/v1/ens?name=vitalik.eth");
const API=()=>document.getElementById("api").value.trim();
let acct=null, reqs=null, net=null; const L=(m)=>{document.getElementById("log").textContent+="\\n"+m;};
const eth=()=>{ if(!window.ethereum) throw new Error("No wallet found. Open in MetaMask in-app browser."); return window.ethereum; };
b1.onclick=async()=>{ try{
  [acct]=await eth().request({method:"eth_requestAccounts"}); L("Account: "+acct); b2.disabled=false;
}catch(e){L("Error: "+(e.message||e));}};
b2.onclick=async()=>{ try{
  const r=await fetch(API()); const j=await r.json(); L("HTTP "+r.status);
  if(r.status!==402) throw new Error("Expected 402");
  reqs=(j.accepts||[]).find(a=>NETS[a.network]); if(!reqs) throw new Error("No supported network in accepts[]");
  net=NETS[reqs.network];
  if(reqs.asset.toLowerCase()!==net.usdc.toLowerCase()) throw new Error("Unexpected asset "+reqs.asset);
  if(Number(reqs.maxAmountRequired)>net.max) throw new Error("Amount "+reqs.maxAmountRequired+" exceeds page cap");
  const CHAIN="0x"+net.id.toString(16);
  try{ await eth().request({method:"wallet_switchEthereumChain",params:[{chainId:CHAIN}]}); }
  catch(e){ if(e.code===4902||/Unrecognized|not added/i.test(e.message||"")) await eth().request({method:"wallet_addEthereumChain",params:[{chainId:CHAIN,chainName:net.name,nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:[net.rpc],blockExplorerUrls:[net.exp]}]}); else throw e; }
  const c=await eth().request({method:"eth_chainId"}); if(parseInt(c,16)!==net.id) throw new Error("Wrong chain "+c);
  L("On "+net.name+" ("+net.id+").");
  L("Pay "+(Number(reqs.maxAmountRequired)/1e6)+" USDC to "+reqs.payTo+" on "+reqs.network); b3.disabled=false;
}catch(e){L("Error: "+(e.message||e));}};
b3.onclick=async()=>{ try{
  b3.disabled=true;
  const n=new Uint8Array(32); crypto.getRandomValues(n); const nonce="0x"+[...n].map(x=>x.toString(16).padStart(2,"0")).join("");
  const now=Math.floor(Date.now()/1000);
  const auth={from:acct,to:reqs.payTo,value:reqs.maxAmountRequired,validAfter:String(now-60),validBefore:String(now+reqs.maxTimeoutSeconds),nonce};
  const typed={types:{EIP712Domain:[{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}],
    TransferWithAuthorization:[{name:"from",type:"address"},{name:"to",type:"address"},{name:"value",type:"uint256"},{name:"validAfter",type:"uint256"},{name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"}]},
    primaryType:"TransferWithAuthorization",domain:{name:reqs.extra.name,version:reqs.extra.version,chainId:net.id,verifyingContract:reqs.asset},message:auth};
  L("Requesting signature...");
  const sig=await eth().request({method:"eth_signTypedData_v4",params:[acct,JSON.stringify(typed)]});
  const xp=btoa(JSON.stringify({x402Version:1,scheme:"exact",network:reqs.network,payload:{signature:sig,authorization:auth}}));
  L("Sending X-PAYMENT...");
  const r=await fetch(API(),{headers:{"X-PAYMENT":xp}}); const body=await r.text(); L("HTTP "+r.status+"\\n"+body);
  const h=r.headers.get("x-payment-response");
  if(h){ const s=JSON.parse(atob(h)); L("Settled tx: "+s.transaction+"\\n"+net.exp+"/tx/"+s.transaction); }
}catch(e){L("Error: "+(e.message||e)); b3.disabled=false;}};
</script></body></html>`;
