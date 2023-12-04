import BookmarkConcept from "./concepts/bookmark";
import FriendConcept from "./concepts/friend";
import GatheringConcept from "./concepts/gathering";
import MessageConcept from "./concepts/message";
import PostConcept from "./concepts/post";
import UserConcept from "./concepts/user";
import WebSessionConcept from "./concepts/websession";

// App Definition using concepts
export const WebSession = new WebSessionConcept();
export const User = new UserConcept();
export const Post = new PostConcept();
export const Friend = new FriendConcept();
export const Bookmark = new BookmarkConcept();
export const Gathering = new GatheringConcept();
export const Message = new MessageConcept();
