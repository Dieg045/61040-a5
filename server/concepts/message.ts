import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";

export interface MessageDoc extends BaseDoc {
  content: string;
  from: ObjectId;
  to: ObjectId;
  dateCreated: Date;
}

export default class MessageConcept {
  public readonly messages = new DocCollection<MessageDoc>("messages");

  async create(from: ObjectId, to: ObjectId, content: string) {
    const dateCreated = new Date();
    const _id = await this.messages.createOne({ from, to, content, dateCreated });
    return { msg: "Message successfully created!", message: await this.messages.readOne({ _id }) };
  }

  async getBySender(user: ObjectId) {
    const messages = await this.messages.readMany(
      { from: user },
      {
        sort: { dateUpdated: -1 },
      },
    );
    return messages;
  }

  async getByReceiver(user: ObjectId) {
    const messages = await this.messages.readMany(
      { to: user },
      {
        sort: { dateUpdated: -1 },
      },
    );
    return messages;
  }
}
