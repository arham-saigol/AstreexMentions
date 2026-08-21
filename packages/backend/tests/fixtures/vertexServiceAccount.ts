import { generateKeyPairSync } from "node:crypto"

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2_048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
})

export function vertexServiceAccountJson(projectId = "astreex-test"): string {
  return JSON.stringify({
    client_email: `astreex@${projectId}.iam.gserviceaccount.com`,
    private_key: privateKey,
    project_id: projectId,
    type: "service_account",
  })
}
