// Common email template styles and components
const LOGO_URL = "https://vylagsnlpgdvlhydvswk.supabase.co/storage/v1/object/public/neocentral-logo/neocentral-logo.png";
const PRIMARY_COLOR = "#F7931E"; // Orange (from frontend --primary)
const TEXT_COLOR = "#111827"; // gray-900 (from frontend --foreground)
const MUTED_COLOR = "#6b7280"; // gray-500 (from frontend --muted-foreground)
const BORDER_COLOR = "#fed7aa"; // orange-200 (from frontend --border)

function getEmailWrapper(content, { appName = "Neo Central DSI", headerTitle = "" } = {}) {
	const currentYear = new Date().getFullYear();
	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${appName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F3F4F6;">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<!-- Main Container -->
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
					<!-- Header Section: Logo + Title inline -->
					<tr>
						<td style="padding: 28px 40px; border-bottom: 1px solid ${BORDER_COLOR};">
							<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
								<tr>
									<td style="vertical-align: middle;" width="50">
										<!--[if mso]>
										<table role="presentation" width="44" cellspacing="0" cellpadding="0" border="0">
											<tr>
												<td>
										<![endif]-->
										<img src="${LOGO_URL}" alt="${appName}" title="${appName}" width="44" height="44" style="display: block; height: 44px; width: 44px; border: 0; outline: none; text-decoration: none;" />
										<!--[if mso]>
												</td>
											</tr>
										</table>
										<![endif]-->
									</td>
									<td style="vertical-align: middle; padding-left: 16px;">
										<span style="font-size: 20px; font-weight: 700; color: ${PRIMARY_COLOR};">${appName}</span>
										${headerTitle ? `<span style="font-size: 20px; font-weight: 400; color: ${TEXT_COLOR};"> - ${headerTitle}</span>` : ""}
									</td>
								</tr>
							</table>
						</td>
					</tr>
					<!-- Content Section -->
					<tr>
						<td style="padding: 32px 40px;">
							${content}
						</td>
					</tr>
					<!-- Footer Section -->
					<tr>
						<td style="padding: 24px 40px; border-top: 1px solid ${BORDER_COLOR}; background-color: #F9FAFB; border-radius: 0 0 12px 12px;">
							<p style="margin: 0 0 12px 0; font-size: 12px; color: ${MUTED_COLOR}; text-align: center;">
								This is an automated system message from ${appName}. Please do not reply directly to this email.
							</p>
							<p style="margin: 0; font-size: 12px; color: ${MUTED_COLOR}; text-align: center;">
								&copy; ${currentYear} ${appName}. All rights reserved.
							</p>
							<p style="margin: 16px 0 0 0; font-size: 12px; text-align: center;">
								<a href="#" style="color: ${PRIMARY_COLOR}; text-decoration: none; margin: 0 8px;">Security Center</a>
								<a href="#" style="color: ${PRIMARY_COLOR}; text-decoration: none; margin: 0 8px;">Privacy Policy</a>
								<a href="#" style="color: ${PRIMARY_COLOR}; text-decoration: none; margin: 0 8px;">Support</a>
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

function getCredentialsBox(items) {
	let rows = "";
	items.forEach(item => {
		rows += `
			<tr>
				<td style="padding: 16px 20px; border-bottom: 1px solid ${BORDER_COLOR}; width: 45%;">
					<span style="font-size: 11px; font-weight: 600; color: ${MUTED_COLOR}; text-transform: uppercase; letter-spacing: 0.5px;">${item.label}</span>
				</td>
				<td style="padding: 16px 20px; border-bottom: 1px solid ${BORDER_COLOR}; text-align: right;">
					<span style="font-size: 14px; color: ${item.highlight ? PRIMARY_COLOR : TEXT_COLOR}; font-weight: ${item.highlight ? '600' : '400'}; font-family: ${item.monospace ? "'Courier New', monospace" : 'inherit'};">${item.value}</span>
				</td>
			</tr>`;
	});
	return `
		<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F9FAFB; border-radius: 8px; border: 1px solid ${BORDER_COLOR}; margin: 24px 0;">
			${rows}
		</table>`;
}

function getPrimaryButton(text, url) {
	return `
		<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
			<tr>
				<td style="border-radius: 8px; background-color: ${PRIMARY_COLOR};">
					<a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 8px;">
						${text}
					</a>
				</td>
			</tr>
		</table>`;
}

function getSecurityNotice(text) {
	return `
		<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 24px;">
			<tr>
				<td style="padding: 16px; background-color: #FFF8F0; border-radius: 8px; border-left: 4px solid ${PRIMARY_COLOR};">
					<p style="margin: 0; font-size: 13px; color: #92400E; line-height: 1.5;">
						🔒 ${text}
					</p>
				</td>
			</tr>
		</table>`;
}

export function passwordResetTemplate({ appName, fullName, resetUrl, expiresInMinutes = 15 }) {
	const content = `
		<p style="margin: 0 0 16px 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6;">
			<strong>Hi ${fullName || "User"},</strong>
		</p>
		<p style="margin: 0 0 16px 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6;">
			We received a request to reset your password. Click the button below to create a new password. This link will expire in <strong>${expiresInMinutes} minutes</strong>.
		</p>
		${getPrimaryButton("Reset Password", resetUrl)}
		${getSecurityNotice(`For your security, this link will expire in ${expiresInMinutes} minutes. If you did not request this password reset, please ignore this email or contact our support team immediately.`)}
	`;
	return getEmailWrapper(content, { appName, headerTitle: "Password Reset" });
}

export function accountInviteTemplate({ appName, fullName, email, temporaryPassword, verifyUrl }) {
	const content = `
		<p style="margin: 0 0 16px 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6;">
			<strong>Hi ${fullName || email || "User"},</strong>
		</p>
		<p style="margin: 0 0 16px 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6;">
			Your account for ${appName || "Neo Central DSI"} has been successfully created. To complete your setup and ensure the security of your account, please use the temporary credentials provided below to sign in and activate your profile.
		</p>
		${getCredentialsBox([
			{ label: "Email Address", value: email },
			{ label: "Temporary Password", value: temporaryPassword, highlight: true, monospace: true }
		])}
		<p style="margin: 0 0 8px 0; font-size: 14px; color: ${TEXT_COLOR}; line-height: 1.6;">
			After your first login, you will be prompted to change this temporary password to a permanent one of your choice.
		</p>
		${getPrimaryButton("Verify Account", verifyUrl)}
		${getSecurityNotice("For your security, this link and temporary password will expire in 48 hours. If you did not request this account activation, please ignore this email or contact our support team immediately.")}
	`;
	return getEmailWrapper(content, { appName, headerTitle: "Account Invitation" });
}

export function accountActivationWithTempPasswordTemplate({ appName, fullName, email, temporaryPassword, verifyUrl }) {
	const content = `
		<p style="margin: 0 0 16px 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6;">
			<strong>Hi ${fullName || email || "User"},</strong>
		</p>
		<p style="margin: 0 0 16px 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6;">
			Your account for ${appName || "Neo Central DSI"} has been successfully created. To complete your setup and ensure the security of your account, please use the temporary credentials provided below to sign in and activate your profile.
		</p>
		${getCredentialsBox([
			{ label: "Email Address", value: email },
			{ label: "Temporary Password", value: temporaryPassword, highlight: true, monospace: true }
		])}
		<p style="margin: 0 0 8px 0; font-size: 14px; color: ${TEXT_COLOR}; line-height: 1.6;">
			After your first login, you will be prompted to change this temporary password to a permanent one of your choice.
		</p>
		${getPrimaryButton("Activate Account", verifyUrl)}
		${getSecurityNotice("For your security, this link and temporary password will expire in 48 hours. If you did not request this account activation, please ignore this email or contact our support team immediately.")}
	`;
	return getEmailWrapper(content, { appName, headerTitle: "Account Activation" });
}

export function passwordAssignedTemplate({ appName, fullName, email, password, loginUrl }) {
	const content = `
		<p style="margin: 0 0 16px 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6;">
			<strong>Hi ${fullName || email || "User"},</strong>
		</p>
		<p style="margin: 0 0 16px 0; font-size: 15px; color: ${TEXT_COLOR}; line-height: 1.6;">
			Your account password has been generated by an administrator. Please use the credentials below to sign in to your account.
		</p>
		${getCredentialsBox([
			{ label: "Email Address", value: email },
			{ label: "Password", value: password, highlight: true, monospace: true }
		])}
		${loginUrl ? getPrimaryButton("Login", loginUrl) : ""}
		${getSecurityNotice("For your security, please change your password after your first login. If you did not expect this email, please contact our support team immediately.")}
	`;
	return getEmailWrapper(content, { appName, headerTitle: "Your Password" });
}

