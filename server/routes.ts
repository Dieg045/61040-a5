import { ObjectId } from "mongodb";

import { Router, getExpressRouter } from "./framework/router";

import { AccessList, Bookmark, Friend, Gathering, Message, Post, User, WebSession } from "./app";
import { BookmarkDoc } from "./concepts/bookmark";
import { GatheringDoc } from "./concepts/gathering";
import { PostDoc, PostOptions } from "./concepts/post";
import { UserDoc } from "./concepts/user";
import { WebSessionDoc } from "./concepts/websession";
import Responses from "./responses";

class Routes {
  @Router.get("/session") //done
  async getSessionUser(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    return await User.getUserById(user);
  }

  @Router.get("/users") //done
  async getUsers() {
    return await User.getUsers();
  }

  @Router.get("/users/:username") //done
  async getUser(username: string) {
    return await User.getUserByUsername(username);
  }

  @Router.post("/users") //done
  async createUser(session: WebSessionDoc, username: string, password: string) {
    WebSession.isLoggedOut(session);
    return await User.create(username, password);
  }

  @Router.patch("/users") //done
  async updateUser(session: WebSessionDoc, update: Partial<UserDoc>) {
    const user = WebSession.getUser(session);
    return await User.update(user, update);
  }

  @Router.delete("/users") //done
  async deleteUser(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    WebSession.end(session);
    return await User.delete(user);
  }

  @Router.post("/login") //done
  async logIn(session: WebSessionDoc, username: string, password: string) {
    const u = await User.authenticate(username, password);
    WebSession.start(session, u._id);
    return { msg: "Logged in!" };
  }

  @Router.post("/logout") //done
  async logOut(session: WebSessionDoc) {
    WebSession.end(session);
    return { msg: "Logged out!" };
  }

  @Router.get("/posts")
  async getAllPosts(session: WebSessionDoc) {
    const u_id = WebSession.getUser(session);

    const friends = await Friend.getFriends(u_id);
    const query = { author: { $in: friends } };
    const posts = await Post.getPosts(query);
    const filteredPosts = posts.filter(async (post) => await AccessList.canView(u_id, post._id));

    return await Responses.posts(filteredPosts);
  }

  @Router.get("/posts/:author")
  async getPosts(session: WebSessionDoc, author: string) {
    const author_id = (await User.getUserByUsername(author))._id;
    const u_id = WebSession.getUser(session);

    const posts = await Post.getPosts({ author: author_id });
    const filteredPosts = posts.filter(async (post) => await AccessList.canView(u_id, post._id));

    return await Responses.posts(filteredPosts);
  }

  @Router.post("/posts") //done
  async createPost(session: WebSessionDoc, content: string, options?: PostOptions) {
    const user = WebSession.getUser(session);
    const created = await Post.create(user, content, options);
    const friends = await Friend.getFriends(user);
    if (created && created.post) {
      await AccessList.addItem(created.post._id, user, [], friends);
    }
    return { msg: created.msg, post: await Responses.post(created.post) };
  }

  @Router.patch("/posts/:_id") //done
  async updatePost(session: WebSessionDoc, _id: ObjectId, update: Partial<PostDoc>) {
    const user = WebSession.getUser(session);
    await Post.isAuthor(user, _id);
    return await Post.update(_id, update);
  }

  @Router.delete("/posts/:_id") //done
  async deletePost(session: WebSessionDoc, _id: ObjectId) {
    const user = WebSession.getUser(session);
    await Post.isAuthor(user, _id);
    await AccessList.deleteItem(_id);
    return await Post.delete(_id);
  }

  @Router.get("/friends")
  async getFriends(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    return await User.idsToUsernames(await Friend.getFriends(user));
  }

  @Router.delete("/friends/:friend")
  async removeFriend(session: WebSessionDoc, friend: string) {
    const user = WebSession.getUser(session);
    const friendId = (await User.getUserByUsername(friend))._id;
    await AccessList.removeAccessAllItems(friendId, user);
    await AccessList.removeAccessAllItems(user, friendId);
    return await Friend.removeFriend(user, friendId);
  }

  @Router.get("/friend/requests")
  async getRequests(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    return await Responses.friendRequests(await Friend.getRequests(user));
  }

  @Router.post("/friend/requests/:to")
  async sendFriendRequest(session: WebSessionDoc, to: string) {
    const user = WebSession.getUser(session);
    const toId = (await User.getUserByUsername(to))._id;
    return await Friend.sendRequest(user, toId);
  }

  @Router.delete("/friend/requests/:to")
  async removeFriendRequest(session: WebSessionDoc, to: string) {
    const user = WebSession.getUser(session);
    const toId = (await User.getUserByUsername(to))._id;
    return await Friend.removeRequest(user, toId);
  }

  @Router.put("/friend/accept/:from")
  async acceptFriendRequest(session: WebSessionDoc, from: string) {
    const user = WebSession.getUser(session);
    const fromId = (await User.getUserByUsername(from))._id;
    await AccessList.setToViewerAllItems(fromId, user);
    await AccessList.setToViewerAllItems(user, fromId);
    return await Friend.acceptRequest(fromId, user);
  }

  @Router.put("/friend/reject/:from")
  async rejectFriendRequest(session: WebSessionDoc, from: string) {
    const user = WebSession.getUser(session);
    const fromId = (await User.getUserByUsername(from))._id;
    return await Friend.rejectRequest(fromId, user);
  }

  //started from here!

  // Retrieves the user's bookmarks
  @Router.get("/bookmarks")
  async getBookmarks(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    const bookmarks = await Bookmark.getByOwner(user);
    return bookmarks;
  }

  // Creates a new bookmark named "name" that directs to "destination" for user
  @Router.post("/bookmarks")
  async createBookmark(session: WebSessionDoc, name: string, destination: string) {
    const user = WebSession.getUser(session);
    const created = await Bookmark.create(user, name, destination);
    return { msg: created.msg, bookmark: await created.bookmark }; //might have to add Response formatting
  }

  // Deletes user's bookmark with id "bookmark"
  @Router.delete("/bookmarks/:name")
  async deleteBookmark(session: WebSessionDoc, name: string) {
    const user = WebSession.getUser(session);
    const _id = (await Bookmark.getByNameAndUser(name, user))._id;
    await Bookmark.isOwner(user, _id);
    return Bookmark.delete(_id);
  }

  @Router.patch("/bookmarks/:name")
  async updateBookmark(session: WebSessionDoc, name: string, update: Partial<BookmarkDoc>) {
    const user = WebSession.getUser(session);
    const _id = (await Bookmark.getByNameAndUser(name, user))._id;
    await Bookmark.isOwner(user, _id);
    return await Bookmark.update(_id, update);
  }

  // Gets all gatherings
  @Router.get("/gathering")
  async getGatherings(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    const gatherings = await Gathering.getGatherings({
      $or: [{ hosts: { $in: [user] } }, { acceptors: { $in: [user] } }],
    });
    return await Responses.gatherings(gatherings);
  }

  // Gets a Gathering by ID
  @Router.get("/gathering/:_id")
  async getGathering(session: WebSessionDoc, _id: string) {
    const user = WebSession.getUser(session);
    const gatheringId = new ObjectId(_id);
    await Gathering.canView(user, gatheringId);
    const gathering = await Gathering.getById(gatheringId);
    return await Responses.gathering(gathering);
  }

  // Creates a Gathering
  @Router.post("/gathering")
  async createGathering(session: WebSessionDoc, title: string, description: string) {
    const user = WebSession.getUser(session);
    const created = await Gathering.create(user, title, description);
    return { msg: created.msg, gathering: await Responses.gathering(created.gathering) }; //might have to add Response formatting
  }

  // Deletes a gathering
  @Router.delete("/gathering/:_id")
  async deleteGathering(session: WebSessionDoc, _id: ObjectId) {
    const user = WebSession.getUser(session);
    await Gathering.isCreator(user, _id);
    await AccessList.deleteItem(_id);
    return Gathering.delete(_id);
  }

  // Update a gathering, such as its hosts or invitees
  @Router.patch("/gathering/:_id")
  async updateGathering(session: WebSessionDoc, _id: ObjectId, update: Partial<GatheringDoc>, invitee?: string) {
    const user = WebSession.getUser(session);
    await Gathering.isCreator(user, _id);
    if (invitee) {
      const inviteeId = (await User.getUserByUsername(invitee))._id;
      await Gathering.invite(user, inviteeId, _id);
    }
    return await Gathering.update(_id, update);
  }

  // Get a user's invites to gatherings
  @Router.get("/invites")
  async getInvites(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    const invites = await Gathering.getInvites({ to: user });
    return Responses.invites(invites);
  }

  @Router.post("/invites/:to")
  async sendInvite(session: WebSessionDoc, to: string, gathering: string) {
    const user = WebSession.getUser(session);
    const toId = (await User.getUserByUsername(to))._id;
    const gatheringId = new ObjectId(gathering);
    await Gathering.isCreator(user, gatheringId);
    const created = await Gathering.invite(user, toId, gatheringId);
    return { msg: created.msg, invite: await Responses.invite(created.invite) };
  }

  // Accept an invite
  @Router.put("/invites/accept/:gathering")
  async acceptInvitation(session: WebSessionDoc, gathering: string) {
    const user = WebSession.getUser(session);
    const gatheringId = new ObjectId(gathering);
    await AccessList.setToViewer(gatheringId, user);
    return await Gathering.acceptInvite(user, gatheringId);
  }

  // Decline an invite
  @Router.put("/invites/decline/:gathering")
  async declineInvitation(session: WebSessionDoc, gathering: string) {
    const user = WebSession.getUser(session);
    const gatheringId = new ObjectId(gathering);
    return await Gathering.declineInvite(user, gatheringId);
  }

  // Get messages sent from the current user
  @Router.get("/messages/sent")
  async getSentMessages(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    const messages = await Message.getBySender(user);
    return await Responses.messages(messages);
  }

  // Get messages received by the current user
  @Router.get("/messages/received")
  async getReceivedMessages(session: WebSessionDoc) {
    const user = WebSession.getUser(session);
    const messages = await Message.getByReceiver(user);
    return await Responses.messages(messages);
  }

  // Create and send a message to a user
  @Router.post("/messages/:to")
  async sendMessage(session: WebSessionDoc, to: string, content: string) {
    const user = WebSession.getUser(session);
    const toId = (await User.getUserByUsername(to))._id;
    await Friend.isFriend(user, toId);
    const created = await Message.create(user, toId, content);
    return { msg: created.msg, message: await Responses.message(created.message) };
  }
}

export default getExpressRouter(new Routes());
