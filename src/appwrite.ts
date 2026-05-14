import { Client, Account, Databases } from "appwrite";

const client = new Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject("69f676b90035c4b12c8a");

const account = new Account(client);
const databases = new Databases(client);

export { client, account, databases };
