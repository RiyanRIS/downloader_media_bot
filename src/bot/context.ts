import { Context } from 'grammy';
import { User } from '../database/repositories/userRepository.js';

export interface MyContext extends Context {
  user?: User;
}
