'use strict';
/**
 * English translations of the legal texts (see legal-texts.js for the German originals).
 * IMPORTANT: These are templates, not legal advice - please have them reviewed before the public launch.
 */
const { BETREIBER, ANSCHRIFT, EMAIL } = require('./legal-texts');
const STAND = 'October 2026';

const impressum = `Legal notice (Impressum, § 5 DDG)

${BETREIBER}
${ANSCHRIFT}
Germany

Contact
Email: ${EMAIL}

Legal form
Sole proprietorship (small business)
Tax number / business identification number: will be added as soon as it is available

Value added tax
No value added tax is shown (small business owner pursuant to § 19 UStG).

Responsible for content pursuant to § 18 (2) MStV
${BETREIBER}, address as above.

Dispute resolution
We are neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board.

Liability for content
As a service provider, we are responsible for our own content in accordance with the general laws. However, pursuant to §§ 8 to 10 DDG, we are not obliged to monitor transmitted or stored third-party information (for example chat messages, letters and profile texts of players). Upon becoming aware of legal infringements, we will remove the relevant content immediately. Please send notifications by email to the address stated above.

Liability for links
Where this service links to external sites, we have no influence on their content and accept no responsibility for it. The respective provider is always responsible.

Copyright
The content and the game concept are subject to German copyright law. Reproduction, modification and distribution beyond the limits of copyright law require the written consent of the operator. Fonts: Inter and Fraunces (SIL Open Font License 1.1), icons: Lucide (ISC License).

Note on the game
TURNING POINT is a fictional simulation game. All persons, businesses and events in the game are entirely fictitious or created by players. The in-game money has no real-world value.`;

const datenschutz = `Privacy policy
Last updated: ${STAND}

1. Controller
${BETREIBER}, ${ANSCHRIFT.replace('\n', ', ')}, email: ${EMAIL}

2. What this is about
TURNING POINT is a browser game. This policy explains which personal data we process when you visit the site and play, for what purpose and on which legal basis.

3. Hosting and server logs
The game is hosted by Hostinger (Hostinger International Ltd.; provider information: hostinger.com). A data processing agreement is in place with the provider. When pages are accessed, the server processes technically necessary data (IP address, date and time, requested address, browser information). Error logs are kept for a limited time. Legal basis: Art. 6 (1) (f) GDPR (secure and stable operation).

4. Account and game progress
When you register, we store your player name, email address and a password stored in encrypted form (bcrypt, no plain text). While you play, game states (characters, assets, family, progress), game settings and logs of important actions (e.g. logins) are created. Legal basis: Art. 6 (1) (b) GDPR (provision of the game).

5. Cookies and local storage
We set a technically necessary session cookie (tp.sid) that keeps you logged in, as well as a security token against request forgery. In your browser's local storage, the game remembers settings such as colour scheme, animations and notices you have read. A service worker caches static files (scripts, images) so that the game loads faster. These storage operations are required for operation (§ 25 (2) no. 2 TDDDG); we do not use tracking or advertising cookies.

6. IP addresses and fraud protection
To protect against abuse (multiple accounts, automated access, manipulation of game states), we store the IP addresses of logged-in players together with the time of access and evaluate usage patterns automatically. This may result in an internal risk score; in case of suspicion, a human decides on blocks, unless automatic blocking has been expressly enabled. Legal basis: Art. 6 (1) (f) GDPR (fair gameplay, protection of our systems and other players). We delete IP assignments when they are no longer required, at the latest when the account is deleted.

7. Community features
The game contains features in which other players can see data about you: character name, player name, city, occupation, businesses, ranking position, a profile text written by you, chat messages in the town square, friend lists, gifts, visits, player jobs as well as relationships and marriage between players. Letters are visible only to the sender and recipient; the team reads a letter only if it has been reported. Under "Players → My profile" you can make yourself invisible at any time; you will then not appear in rankings, profiles, chat presence and newspaper reports. Chat messages are deleted regularly. Legal basis: Art. 6 (1) (b) GDPR (multiplayer features as part of the contract) and (f) (moderation).

8. Email
For confirmation and password reset emails, we use an email service (SMTP of the mailbox provider). Your email address is transmitted to this service. Legal basis: Art. 6 (1) (b) GDPR.

9. Payments (only if purchases are enabled)
Purchases of in-game currency or a season pass are handled by a payment service provider (e.g. Stripe Payments Europe Ltd., Ireland). You enter payment data directly with the provider and we do not receive it; we only store the amount, time, purchased package and a reference number. Legal basis: Art. 6 (1) (b) GDPR; statutory retention obligations (§ 147 AO, § 257 HGB) under Art. 6 (1) (c) GDPR.

10. Rewarded advertising (only if enabled)
If you voluntarily watch a rewarded ad, an advertising partner may process data (e.g. IP address, device information). This happens only at your initiative and will be added here before a specific provider is introduced.

11. Storage period
We store account data and game states for as long as your account exists. After the account is deleted, we remove your data unless statutory retention obligations apply (e.g. payment records for up to ten years). Logs are deleted after a reasonable period.

12. Recipients and third countries
Recipients are only the service providers named (hosting, email, if applicable payment provider), to the extent necessary for the respective function. Data is transferred to countries outside the EU/EEA only if the respective provider offers appropriate safeguards pursuant to Art. 44 et seq. GDPR.

13. Your rights
You have the right of access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to object to processing based on legitimate interests (Art. 21 GDPR). Access and data export (JSON file) as well as permanent deletion of your account are available directly in the game under “My account”. Alternatively, an email to ${EMAIL} is sufficient.

14. Right to lodge a complaint
You can lodge a complaint with a data protection supervisory authority, for example with the competent State Commissioner for Data Protection of Lower Saxony (Landesbeauftragte für den Datenschutz Niedersachsen), Prinzenstraße 5, 30159 Hannover.

15. Minimum age
This service is aimed at persons aged 16 and over. If you are younger, please do not register.

16. Obligation to provide data
Without a player name, email address and password, no account can be created. All further information (profile text, visibility) is voluntary.

17. Changes
We will update this policy if the game or the legal situation changes. The version published here applies.`;

const agb = `Terms of Use (General Terms and Conditions) for TURNING POINT
Last updated: ${STAND}

1. Scope and provider
These terms apply to the use of the browser game TURNING POINT. The provider is ${BETREIBER}, ${ANSCHRIFT.replace('\n', ', ')}, email: ${EMAIL}.

2. Service
TURNING POINT is a simulation game that is free to play. There is no entitlement to a particular duration of play, a particular range of functions or constant availability. The game may be further developed, changed, temporarily shut down or discontinued; game balance, prices and rules may be adjusted.

3. Registration and account
Use requires an account. You must be at least 16 years old and provide truthful information. One account per person is intended. Keep your login details secret; you are responsible for actions taken under your account if you are responsible for the misuse.

4. In-game money, EFS and coins
In-game money (DM/€ in the game), EFS and coins are virtual game elements without real-world value. They cannot be exchanged for real money or paid out, and cannot be transferred outside the functions provided in the game. They expire when the account is deleted or blocked. There is no entitlement to retain particular game states.

5. Paid offers (where available)
Coins or a season pass can optionally be purchased. The prices shown in the shop in euros apply. ${'As a small business owner under § 19 UStG, no value added tax is shown.'} Payment is made via the payment service provider named during checkout. Season passes run for the stated period and renew only if the shop expressly states so; they can be cancelled at any time effective the end of the current term. The cancellation policy (Widerrufsbelehrung) applies to purchases.

6. Rules of conduct
Not permitted are: insults, hate speech, threats, sexualised or unlawful content in chat, letters, profiles and names; spam and advertising; deceiving other players; exploiting bugs; the use of bots, scripts or other aids that automate or manipulate gameplay; multiple accounts to gain advantages (e.g. transferring money between one's own accounts); interference with the technical security of the game.

7. Moderation and blocking
In case of violations, we may remove content, restrict functions (e.g. muting), reset game states and block accounts temporarily or permanently. In case of unjustified suspicion, an informal email to us will help. The right to terminate for good cause remains unaffected.

8. Player content
You remain the author of your contributions, but grant us the non-exclusive right to display and store them within the game. You assure us that your contributions do not infringe the rights of third parties. Reports of unlawful content can reach us via the report function in the game or by email.

9. Liability
We are liable without limitation in cases of intent and gross negligence, for injury to life, body and health, and under the Product Liability Act. In cases of slightly negligent breach of essential contractual obligations, liability is limited to the typically foreseeable damage; otherwise, liability for slight negligence is excluded. For the loss of game states and in-game money due to technical faults, we are liable within the scope of these rules; we recommend not attaching any importance to the game beyond the enjoyment of playing.

10. Termination and deletion
You can stop playing at any time. You can delete your account yourself at any time under “My account” or request deletion by email to ${EMAIL}. We may terminate the contractual relationship with reasonable notice, and without notice for good cause.

11. Changes to these terms
We may change these terms with effect for the future if this is objectively necessary (e.g. new features or changes in the law). We will inform you of material changes in the game or by email; if you do not object within four weeks and continue to play, the new terms apply.

12. Final provisions
German law applies, excluding the UN Convention on Contracts for the International Sale of Goods; with respect to consumers, this applies only insofar as mandatory consumer protection provisions of the state in which you have your habitual residence do not provide otherwise. Should individual provisions be invalid, the remainder remains effective.`;

const widerruf = `Cancellation policy (Widerrufsbelehrung) for in-game purchases
Last updated: ${STAND}

This policy applies only to paid purchases (e.g. coins or season pass) by consumers. Playing for free is not affected.

Right of withdrawal
You have the right to withdraw from this contract within fourteen days without giving any reason. The withdrawal period is fourteen days from the day the contract was concluded.

To exercise your right of withdrawal, you must inform us (${BETREIBER}, ${ANSCHRIFT.replace('\n', ', ')}, email: ${EMAIL}) of your decision to withdraw from this contract by means of a clear statement (e.g. a letter sent by post or an email). You may use the attached model withdrawal form, but this is not mandatory. To meet the withdrawal deadline, it is sufficient that you send the communication concerning your exercise of the right of withdrawal before the withdrawal period has expired.

Consequences of withdrawal
If you withdraw from this contract, we must reimburse all payments we have received from you without undue delay and at the latest within fourteen days from the day on which we received the notification of your withdrawal. For this reimbursement, we will use the same means of payment that you used for the original transaction; in no event will you be charged any fees because of this reimbursement. Coins and benefits already credited will be removed again in the event of withdrawal.

Early expiry of the right of withdrawal for digital content
The right of withdrawal expires in the case of a contract for the supply of digital content not supplied on a tangible medium (e.g. coins) if we have begun performing the contract after you expressly consented to our beginning performance before the withdrawal period expired and confirmed that you thereby lose your right of withdrawal (§ 356 (5) BGB). For season passes (service), the right of withdrawal expires after the service has been fully performed if you previously expressly consented and confirmed that you lose your right of withdrawal upon full performance of the contract (§ 356 (4) BGB); if performance began early, in the event of withdrawal you must pay a proportionate amount for the service provided up to that point.

Model withdrawal form
(If you want to withdraw from the contract, please complete and return this form.)

To: ${BETREIBER}, ${ANSCHRIFT.replace('\n', ', ')}, email: ${EMAIL}
I/We (*) hereby withdraw from the contract concluded by me/us (*) for the purchase of the following goods (*) / the provision of the following service (*):
Ordered on (*) / received on (*):
Name of consumer(s):
Address of consumer(s):
Player name in the game:
Date:
(*) Delete as appropriate.`;

module.exports = { impressum, datenschutz, agb, widerruf };
