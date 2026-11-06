# Server holds the freelancer's Noir owner key

Noir requires the wallet owner to sign `registerDevice`, `registerAgent` and `fundEscrow`; only `authorizePayment` is signed by the agent key. If the freelancer signs these in the Noir extension, every client payment needs a manual approval, so nothing happens without a human tap. We let the Envelo server hold the owner key so that a client payment flows all the way to a remittance with no clicks. The trade-off is that Envelo is custodial, the same trust a salaried employee gives an employer who withholds contributions, and we say so in the pitch. The Noir contract still caps what the agent can spend per remittance and enforces the deadline, whatever the server or the AI decides.

## Considered Options

- **Freelancer signs in the Noir extension (non-custodial).** Safer, but every set-aside needs an approval, which breaks the "payroll deduction" promise and weakens the agentic demo. Kept on the roadmap as a non-custodial mode, built from `prepare` → wallet signature → `submit` with Velo Gas Station paying fees.

## Consequences

- Velo checkout funds likely land in Envelo's Velo project wallet anyway, so the client-payment leg is custodial regardless of this choice.
- The owner secret lives only in the server `.env`, never in the web app or the repo.
