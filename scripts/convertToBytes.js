const base64String = process.argv[2];

if (!base64String) {
  console.error("Please provide a base64 string as an argument");
  process.exit(1);
}

// Convert base64 to bytes
const buffer = Buffer.from(base64String, "base64");

// Output the bytes in hex format
console.log("0x" + buffer.toString("hex"));
