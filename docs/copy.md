# Copy deck — v1 (collection framing)

Rule: never imply free money. Checking is read-only; signing moves the balance to the address shown.

## H1 variants (pick one, others discarded)

| # | line 1 | line 2 | chars |
|---|---|---|---|
| A | See your balance. | Move it in one signature. | 16 / 25 |
| B | Check it first. | Then collect it. | 14 / 15 |
| C | One address. | One signature. No surprises. | 13 / 28 |

Selected: A.

## Lede

Checking is read-only. Collecting moves the balance to the address below — one transaction, fee shown first. (114)

## Badges

- No wallet to check (18)
- Recipient shown first (20)
- One signature to collect (24)

## Result block

- label: Balance to collect (18)
- fineprint: This is what leaves your wallet. (32)
- button: Sign to collect (16)
- sub: One transaction. Address, amount and fee are above. (52)

## Steps (before the button)

1. Wallet opens — Your wallet shows the request. (38)
2. Check three rows — To, Amount, Network fee. Fixed before you sign. (60)
3. Confirm — funds move — One signature sends the balance to the address above. (65)

## Provenance

- Source: Data: public RPC · Jupiter prices (33)
- Freshness: Rates and record refreshed 2026-11-22 (40)

## Recovery

- Where to look: the transaction stays in your wallet history. Open it there, or search the signature on a block explorer. (120)
- What it usually means: a rejected signature costs nothing. A failed send is refunded by the network, minus the fee. (115)
- Who to ask: send the signature and your address. Never send a seed phrase or a private key — to us or to anyone. (112)

## Privacy strip

- No account (10)
- No cookies (10)
- Cookieless counts (16)
- Address shared with public RPC only. (36)

## Disclaimer

Independent tool. Funds go to the address shown above; we never hold them. (74)

## FAQ addition

- Why "collect" and not "claim"? Nothing new is minted. Your own balance moves to the address above. (94)
